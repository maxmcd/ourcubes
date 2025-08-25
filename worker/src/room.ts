import type {
    CanvasState,
    ClientMsg,
    Env,
    OpSetVoxel,
    PackedState,
    PlayerPresence,
    ServerMsg,
    StaticRoomData,
} from "./schema";

export class VoxelRoomDO {
    state: DurableObjectState;
    env: Env;
    connections = new Set<WebSocket>();
    canvas: CanvasState = {
        size: 20,
        voxels: new Map(),
        lamport: 0,
        version: 0,
    };
    bucketMap = new WeakMap<WebSocket, { tokens: number; last: number }>();
    playerPresence = new Map<WebSocket, PlayerPresence>(); // Track player cursors
    persistTimer?: number; // Timer for debounced persistence

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
        state.blockConcurrencyWhile(async () => {
            const meta = await state.storage.get<{ version: number; lamport: number }>("meta");
            const packed = await state.storage.get<PackedState>("voxels");
            if (meta) {
                this.canvas.version = meta.version ?? 0;
                this.canvas.lamport = meta.lamport ?? 0;
            }
            if (packed) {
                for (const entry of packed) {
                    const [k, hex, t] = entry.length === 3 ? entry : [entry[0], entry[1], 0];
                    this.canvas.voxels.set(k, { color: hex, t });
                }
            }
        });
    }

    async fetch(req: Request) {
        const url = new URL(req.url);
        const path = url.pathname;

        if (path.endsWith("/ws") && req.headers.get("upgrade") === "websocket") {
            const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
            await this.handleSocket(server, req);
            return new Response(null, { status: 101, webSocket: client });
        }

        if (path.endsWith("/state")) {
            const packed = this.packState();
            return Response.json({
                version: this.canvas.version,
                voxels: packed,
            });
        }

        if (path.endsWith("/seed") && req.method === "POST") {
            if (
                this.env.ROOM_SEED_SECRET &&
                req.headers.get("x-seed") !== this.env.ROOM_SEED_SECRET
            ) {
                return new Response("forbidden", { status: 403 });
            }
            await this.seedDemo();
            return new Response("ok");
        }

        if (path.endsWith("/freeze") && req.method === "POST") {
            // Extract room slug from the URL path
            const roomSlugMatch = path.match(/\/api\/room\/([\w-]+)\/freeze$/);
            const roomSlug = roomSlugMatch ? roomSlugMatch[1] : "unknown";

            const success = await this.freezeRoom(roomSlug);
            if (success) {
                return Response.json({
                    success: true,
                    message: "Room frozen and saved statically",
                });
            } else {
                return Response.json(
                    { success: false, message: "Failed to freeze room" },
                    { status: 500 }
                );
            }
        }

        return new Response("not found", { status: 404 });
    }

    async handleSocket(ws: WebSocket, _req: Request) {
        ws.accept();
        this.connections.add(ws);
        this.bucketMap.set(ws, { tokens: 80, last: Date.now() });

        const send = (msg: ServerMsg) => {
            try {
                ws.send(JSON.stringify(msg));
            } catch {}
        };

        ws.addEventListener("message", async (ev) => {
            let msg: ClientMsg;
            try {
                msg = JSON.parse(ev.data as string);
            } catch {
                return;
            }

            await this.handleMessage(msg, ws, send);
        });

        ws.addEventListener("close", () => {
            this.connections.delete(ws);
            this.bucketMap.delete(ws);
            this.playerPresence.delete(ws);
            // Broadcast updated presence when someone leaves
            this.broadcastPresence();
        });
    }

    private async handleMessage(msg: ClientMsg, ws: WebSocket, send: (msg: ServerMsg) => void) {
        if (msg.type === "hello") {
            await this.handleHello(msg, ws, send);
            return;
        }

        if (msg.type === "ping") {
            send({ type: "pong", at: msg.at, now: Date.now() });
            return;
        }

        if (msg.type === "set" && Array.isArray(msg.ops)) {
            await this.handleSetOps(msg, ws, send);
            return;
        }

        if (msg.type === "presence") {
            this.handlePresence(msg, ws);
            return;
        }
    }

    private async handleHello(
        msg: { playerId?: string },
        ws: WebSocket,
        send: (msg: ServerMsg) => void
    ) {
        const playerId = msg.playerId ?? this.randomId();
        this.playerPresence.set(ws, { playerId });
        send({
            type: "welcome",
            playerId,
            state: this.packState(),
            version: this.canvas.version,
        });
    }

    private async handleSetOps(
        msg: { ops: OpSetVoxel[] },
        ws: WebSocket,
        send: (msg: ServerMsg) => void
    ) {
        if (!this.checkBucket(ws, msg.ops.length)) {
            send({
                type: "reject",
                reason: "rate",
                retryAfterMs: 1000,
            });
            return;
        }

        const applied: OpSetVoxel[] = [];
        for (const op of msg.ops) {
            const appliedOp = this.processVoxelOp(op);
            if (appliedOp) {
                applied.push(appliedOp);
            }
        }

        if (applied.length) {
            this.canvas.version++;
            this.schedulePersist();
            this.broadcast({ type: "apply", ops: applied, version: this.canvas.version });
        }
    }

    private processVoxelOp(op: OpSetVoxel): OpSetVoxel | null {
        const k = op.k | 0;
        if (k < 0 || k >= 8000) return null;

        this.canvas.lamport = Math.max(this.canvas.lamport + 1, (op.t | 0) + 1);
        const t = this.canvas.lamport;

        if (op.color === null) {
            const cur = this.canvas.voxels.get(k);
            if (!cur || t < (cur.t ?? 0)) return null;
            this.canvas.voxels.delete(k);
            return { type: "set", k, color: null, t, by: op.by };
        } else {
            const cur = this.canvas.voxels.get(k);
            if (cur && t < (cur.t ?? 0)) return null;
            this.canvas.voxels.set(k, { color: op.color, t, by: op.by });
            return { type: "set", k, color: op.color, t, by: op.by };
        }
    }

    private handlePresence(msg: { cursor?: [number, number, number] }, ws: WebSocket) {
        const presence = this.playerPresence.get(ws);
        if (presence) {
            const updatedPresence = {
                playerId: presence.playerId,
                cursor: msg.cursor,
            };
            this.playerPresence.set(ws, updatedPresence);
            this.broadcastPresence();
        }
    }

    broadcast(msg: ServerMsg) {
        const s = JSON.stringify(msg);
        for (const ws of this.connections) {
            try {
                ws.send(s);
            } catch {}
        }
    }

    broadcastPresence() {
        // Deduplicate by playerId (keep the most recent entry)
        const playersMap = new Map<string, PlayerPresence>();
        for (const presence of this.playerPresence.values()) {
            playersMap.set(presence.playerId, presence);
        }
        const players: PlayerPresence[] = Array.from(playersMap.values());
        this.broadcast({ type: "presence", players });
    }

    packState(): PackedState {
        const out: PackedState = [];
        for (const [k, v] of this.canvas.voxels) out.push([k, v.color, v.t]);
        return out;
    }

    schedulePersist() {
        // Clear any existing timer
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
        }

        // Schedule persistence after 500ms of inactivity
        this.persistTimer = setTimeout(async () => {
            try {
                await this.persist();
            } catch (error) {
                console.error("Failed to persist state:", error);
            }
        }, 500);
    }

    async persist() {
        try {
            await this.state.storage.put("voxels", this.packState());
            await this.state.storage.put("meta", {
                version: this.canvas.version,
                lamport: this.canvas.lamport,
            });
        } catch (error) {
            console.error("Storage operation failed:", error);
            throw error;
        }
    }

    checkBucket(ws: WebSocket, cost = 1): boolean {
        const b = this.bucketMap.get(ws);
        if (!b) return false;
        const now = Date.now();
        const refill = Math.floor((now - b.last) / 50) * 1; // 1 token / 50ms
        b.tokens = Math.min(80, b.tokens + Math.max(0, refill));
        b.last = now;
        if (b.tokens < cost) return false;
        b.tokens -= cost;
        return true;
    }

    randomId(): string {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        return btoa(String.fromCharCode(...bytes))
            .replaceAll("+", "-")
            .replaceAll("/", "_")
            .replaceAll("=", "");
    }

    async freezeRoom(roomSlug: string): Promise<boolean> {
        try {
            const staticRoomData: StaticRoomData = {
                version: this.canvas.version,
                voxels: this.packState(),
                frozenAt: Date.now(),
                metadata: {
                    roomSlug: roomSlug,
                },
            };

            // Save to KV with key "static:{roomSlug}"
            await this.env.STATIC_ROOMS.put(`static:${roomSlug}`, JSON.stringify(staticRoomData));

            console.log(`Room ${roomSlug} frozen and saved to KV`);
            return true;
        } catch (error) {
            console.error("Failed to freeze room:", error);
            return false;
        }
    }

    async seedDemo() {
        // simple diagonal line
        for (let i = 0; i < 20; i++) {
            const k = i + i * 20 + i * 400;
            this.canvas.voxels.set(k, { color: "#FF00FF", t: ++this.canvas.lamport });
        }
        this.canvas.version++;
        await this.persist();
    }
}
