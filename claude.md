Here’s a tight, build-ready spec you can paste into Claude Code. I’ve kept
everything in code blocks per your request.

````markdown
# Project: Voxel Canvas (20×20×20) with Cloudflare Durable Objects

A collaborative 3D canvas where anonymous players place colored cubes (voxels)
inside a 20×20×20 space. Each canvas/room is backed by a Cloudflare Durable
Object (DO) for real-time coordination and persistence. Clients connect over
WebSocket for live updates. The UI is a lightweight Three.js scene with simple
drag/zoom camera controls.

players join the next room and once there are 4 players the game starts and the
four get in their rooms. they get to pick a color to identify with, no names.

the room is private until they all agree to publish and then no more edits can
be make and the game is static.

---

## Core Requirements

- 3D grid: **20 × 20 × 20** (x, y, z in `[0..19]`)
- Voxel colors: 24-bit RGB (hex) or named palette; transparent = empty
- Anonymous play: assign ephemeral `playerId` on first visit (cookie based
  sessions, no logins)
- Real-time sync: WebSocket broadcast via DO; late joiners get full state
- Conflict policy: last-write-wins (Lamport timestamp in DO)
- Rooms: `/room/:slug` → each **slug → Durable Object ID**
- Persistence: state stored in DO storage (full state + small op log); periodic
  compact
- Cursor/Presence: lightweight presence (player cursors or camera hints)

---

## Tech Stack

- **Edge runtime**: Cloudflare Workers (TypeScript)
- **Coordination**: Durable Objects
- **Static assets**: deployed with Worker Sites or Pages
- **Client**: TypeScript + Three.js (or bare WebGL if preferred)
- **Build**: Wrangler v3

---

## Coordinate System

- Right-handed; origin at lower-north-west corner.
- Axes:
  - x: left → right (0..19)
  - y: bottom → top (0..19)
  - z: near → far (0..19)
- A voxel key is encoded as `k = x + y*20 + z*400` (single `uint16` range
  0..7999).

---

## Data Model

### Voxel

```ts
type VoxelKey = number; // 0..7999
type ColorHex = string; // "#RRGGBB"
interface Voxel {
    color: ColorHex; // "#000000".."#FFFFFF"
    t: number; // lamport timestamp for LWW
    by?: string; // optional playerId attribution
}
```
````

### Canvas State (inside Durable Object)

```ts
interface CanvasState {
    size: 20; // fixed
    voxels: Map<VoxelKey, Voxel>; // only non-empty entries stored
    lamport: number; // DO-wide logical clock
    version: number; // increments on write
}
```

### Operation

```ts
interface OpSetVoxel {
    type: "set";
    k: VoxelKey;
    color: ColorHex | null; // null means clear
    t: number; // client-supplied lamport (will be maxed by DO)
    by?: string; // playerId
}
```

---

## Networking

### URLs

- `GET /api/room/:slug/ws` → WebSocket upgrade to that room’s DO
- `GET /api/room/:slug/state` → snapshot JSON (debug/tools)
- `POST /api/room/:slug/seed` → (dev only) seed initial pattern

### WebSocket Protocol (JSON, one message per frame)

#### Client → Server

```ts
type ClientMsg =
    | { type: "hello"; playerId?: string; clientClock?: number }
    | { type: "set"; ops: OpSetVoxel[] } // batch for latency/burst
    | { type: "ping"; at: number }
    | { type: "presence"; cursor?: [number, number, number]; camera?: any }; // optional
```

#### Server → Client

```ts
type ServerMsg =
    | { type: "welcome"; playerId: string; state: PackedState; version: number }
    | { type: "apply"; ops: OpSetVoxel[]; version: number } // authoritative
    | { type: "reject"; reason: string; retryAfterMs?: number }
    | { type: "pong"; at: number; now: number }
    | { type: "presence"; players: Presence[] }; // optional
```

### Packed State

To reduce payload size, send an array of `[k, hex]` for non-empty voxels.

```ts
type PackedState = Array<[VoxelKey, string]>; // color hex; empty voxels omitted
```

---

## Conflict Resolution

- Maintain a DO-wide `lamport` counter.
- On incoming op(s): `t' = max(op.t, state.lamport + 1)`. Store with `t'`.
- Compare by key `k`: overwrite only if `incoming.t >= existing.t`.
- Broadcast **authoritative** `apply` with the stored `t'` values.

---

## Rate Limiting & Flood Control

- Per-socket token bucket: e.g., 40 ops / 2 seconds; burst 80.
- Enforce batch size: `ops.length <= 128`.
- Drop or `reject` with `retryAfterMs` on violation.
- Server coalesces multiple ops to same `k` in a tick.

---

## Persistence & Compaction

- On each write, update in-memory Map + Durable Object storage (KV-like).
- DO storage key layout:

  - `meta`: `{version, lamport}`
  - `voxels`: binary or JSON blob (packed array) of non-empty voxels
- Compact policy: after every N (=200) writes, persist the full packed map.

---

## Anonymous Identity

- `playerId` is a random URL-safe 22-char string; stored in localStorage.
- On first `hello` without an id, server issues one in `welcome`.

---

## Client UX

- Three.js scene with simple voxel instancing (InstancedMesh).
- Camera: OrbitControls (drag to rotate, wheel to zoom, right-drag to pan).
- Hover highlight: outline the voxel under cursor.
- Click/drag paint: left-drag = paint color, right-drag = erase (or keybinding).
- Color picker: small palette + hex input.
- Latency smoothing: optimistic local apply; reconcile on `apply`.

---

## Folder Structure

```
/ (repo root)
├─ worker/
│  ├─ src/
│  │  ├─ index.ts        // fetch router, DO binding, room lookup
│  │  ├─ room.ts         // Durable Object class: VoxelRoomDO
│  │  ├─ schema.ts       // types + zod validation
│  │  ├─ rate.ts         // token bucket utils
│  │  └─ utils.ts
│  └─ wrangler.toml
├─ web/
│  ├─ src/
│  │  ├─ main.ts
│  │  ├─ App.tsx
│  │  ├─ three/
│  │  │  ├─ scene.ts
│  │  │  └─ voxels.ts    // instancing, picking, packing/unpacking
│  │  └─ net/ws.ts       // ws client, message handlers
│  └─ index.html
└─ README.md
```

---

## Wrangler Config (example)

```toml
# worker/wrangler.toml
name = "voxel-canvas"
main = "src/index.ts"
compatibility_date = "2024-10-01"

[durable_objects]
bindings = [
  { name = "VOXEL_ROOM", class_name = "VoxelRoomDO" }
]

[[migrations]]
tag = "v1"
new_classes = ["VoxelRoomDO"]

[vars]
ROOM_SEED_SECRET = "dev-seed-ok" # remove in prod
```

---

## Durable Object Skeleton (TypeScript)

```ts
// worker/src/room.ts
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

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
        state.blockConcurrencyWhile(async () => {
            const meta = await state.storage.get<any>("meta");
            const packed = await state.storage.get<PackedState>("voxels");
            if (meta) {
                this.canvas.version = meta.version ?? 0;
                this.canvas.lamport = meta.lamport ?? 0;
            }
            if (packed) {
                for (const [k, hex] of packed) {
                    this.canvas.voxels.set(k, { color: hex, t: 0 });
                }
            }
        });
    }

    async fetch(req: Request) {
        const url = new URL(req.url);
        const path = url.pathname;

        if (
            path.endsWith("/ws") && req.headers.get("upgrade") === "websocket"
        ) {
            const [client, server] = Object.values(new WebSocketPair()) as [
                WebSocket,
                WebSocket,
            ];
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

        return new Response("not found", { status: 404 });
    }

    async handleSocket(ws: WebSocket, req: Request) {
        ws.accept();
        this.connections.add(ws);
        this.bucketMap.set(ws, { tokens: 80, last: Date.now() });

        const send = (msg: any) => {
            try {
                ws.send(JSON.stringify(msg));
            } catch {}
        };

        ws.addEventListener("message", async (ev) => {
            let msg: any;
            try {
                msg = JSON.parse(ev.data as string);
            } catch {
                return;
            }

            if (msg.type === "hello") {
                const playerId = msg.playerId ?? this.randomId();
                send({
                    type: "welcome",
                    playerId,
                    state: this.packState(),
                    version: this.canvas.version,
                });
                return;
            }

            if (msg.type === "ping") {
                send({ type: "pong", at: msg.at, now: Date.now() });
                return;
            }

            if (msg.type === "set" && Array.isArray(msg.ops)) {
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
                    const k = op.k | 0;
                    if (k < 0 || k >= 8000) continue;
                    this.canvas.lamport = Math.max(
                        this.canvas.lamport + 1,
                        (op.t | 0) + 1,
                    );
                    const t = this.canvas.lamport;
                    if (op.color === null) {
                        const cur = this.canvas.voxels.get(k);
                        if (!cur || t < (cur.t ?? 0)) continue;
                        this.canvas.voxels.delete(k);
                        applied.push({
                            type: "set",
                            k,
                            color: null,
                            t,
                            by: op.by,
                        });
                    } else {
                        const cur = this.canvas.voxels.get(k);
                        if (cur && t < (cur.t ?? 0)) continue;
                        this.canvas.voxels.set(k, {
                            color: op.color,
                            t,
                            by: op.by,
                        });
                        applied.push({
                            type: "set",
                            k,
                            color: op.color,
                            t,
                            by: op.by,
                        });
                    }
                }
                if (applied.length) {
                    this.canvas.version++;
                    await this.persistMaybe();
                    this.broadcast({
                        type: "apply",
                        ops: applied,
                        version: this.canvas.version,
                    });
                }
                return;
            }
        });

        ws.addEventListener("close", () => {
            this.connections.delete(ws);
            this.bucketMap.delete(ws);
        });
    }

    broadcast(msg: any) {
        const s = JSON.stringify(msg);
        for (const ws of this.connections) {
            try {
                ws.send(s);
            } catch {}
        }
    }

    packState(): PackedState {
        const out: PackedState = [];
        for (const [k, v] of this.canvas.voxels) out.push([k, v.color]);
        return out;
    }

    async persistMaybe() {
        if (this.canvas.version % 200 === 0) {
            await this.state.storage.put("voxels", this.packState());
            await this.state.storage.put("meta", {
                version: this.canvas.version,
                lamport: this.canvas.lamport,
            });
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
        return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-")
            .replaceAll("/", "_").replaceAll("=", "");
    }

    async seedDemo() {
        // simple diagonal line
        for (let i = 0; i < 20; i++) {
            const k = i + i * 20 + i * 400;
            this.canvas.voxels.set(k, {
                color: "#FF00FF",
                t: ++this.canvas.lamport,
            });
        }
        this.canvas.version++;
        await this.state.storage.put("voxels", this.packState());
        await this.state.storage.put("meta", {
            version: this.canvas.version,
            lamport: this.canvas.lamport,
        });
    }
}
```

---

## Worker Router (bind DO & routes)

```ts
// worker/src/index.ts
import { VoxelRoomDO } from "./room";

export interface Env {
    VOXEL_ROOM: DurableObjectNamespace;
    ROOM_SEED_SECRET?: string;
}

export default {
    async fetch(req: Request, env: Env) {
        const url = new URL(req.url);
        const match = url.pathname.match(
            /^\/api\/room\/([\w-]+)\/(ws|state|seed)$/,
        );
        if (match) {
            const [, slug, action] = match;
            const id = env.VOXEL_ROOM.idFromName(slug);
            const stub = env.VOXEL_ROOM.get(id);
            return stub.fetch(
                new Request(
                    new URL(`/api/room/${slug}/${action}`, "http://do")
                        .toString(),
                    req,
                ),
            );
        }
        // static assets (if bundling UI with worker) or redirect to Pages site
        return new Response("ok", { status: 200 });
    },
};

export { VoxelRoomDO };
```

---

## Client Sketch (Three.js + WS)

```ts
// web/src/net/ws.ts
export type ApplyHandler = (ops: any[], version: number) => void;

export function connect(
    slug: string,
    onApply: ApplyHandler,
    onWelcome: (state: any) => void,
) {
    const ws = new WebSocket(
        `${
            location.protocol === "https:"
                ? "wss"
                : "ws"
        }://${location.host}/api/room/${slug}/ws`,
    );
    const playerId = localStorage.getItem("playerId") || undefined;

    ws.onopen = () =>
        ws.send(
            JSON.stringify({
                type: "hello",
                playerId,
                clientClock: Date.now(),
            }),
        );
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "welcome") {
            if (msg.playerId) localStorage.setItem("playerId", msg.playerId);
            onWelcome(msg);
        } else if (msg.type === "apply") {
            onApply(msg.ops, msg.version);
        }
    };

    function setOps(ops: any[]) {
        ws.send(JSON.stringify({ type: "set", ops }));
    }

    return { ws, setOps };
}
```

```ts
// web/src/three/voxels.ts (packing helper)
export const key = (x: number, y: number, z: number) => x + y * 20 + z * 400;
export function unpack(packed: Array<[number, string]>) {
    const map = new Map<number, string>();
    for (const [k, hex] of packed) map.set(k, hex);
    return map;
}
```

---

## MVP Acceptance Criteria

1. Navigate to `/room/demo`, page loads a 20×20×20 grid and connects via WS.
2. First client receives `welcome` with `state` and renders existing voxels.
3. Clicking a cell sets a voxel to chosen color; dragging paints multiple cells.
4. Another client in the same room sees updates in < 250ms (same network
   region).
5. Reloading preserves canvas (persisted in DO storage).
6. Rate limiting prevents >80 voxel writes per second from one tab.
7. Optional: right-click or key to erase (color `null`), instantly synced.

---

## Tests (high-level)

- **State hydration**: joining an empty/new room returns empty state.
- **Set/overwrite**: later timestamp wins for same voxel.
- **Batching**: sending 100 ops applies atomically in order.
- **Persistence**: after 300 writes and DO restart, state matches last
  `packState`.
- **Flood control**: exceeding bucket → server sends `reject`.
- **Version monotonicity**: versions strictly increase on any apply.

---

## Stretch Ideas (post-MVP)

- Per-room palette voting; seasonal palettes
- Timelapse playback: DO stores sparse snapshots every N versions
- “Exhibits”: export GLTF/PNG previews
- Soft-locks: reserve a region for a few seconds while painting
- Presence: show tiny floating cursors or camera frustums

---

````
```md
## Notes for the Implementer

- Use zod (or similar) on the Worker to validate incoming messages.
- Prefer `InstancedMesh` (Three.js) for 8k voxels; rebuild instance matrices on diff only.
- Picking: cast a ray to the bounded cube; quantize to `floor(coord)` in `[0..19]`.
- For optimistic UX, apply local ops immediately, but still process authoritative `apply`.
- If you want prettier perf, debounce WS sends into 16ms frames; coalesce same-key ops.
````

```bash
# Quick Commands (dev hints)
wrangler dev --local --persist
wrangler publish
```

If you want, I can also generate a minimal Vite + Three.js client scaffold and a
ready-to-run `wrangler.toml` tuned to your account—just say the word and I’ll
include those files.
