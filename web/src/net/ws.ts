import type { OpSetVoxel, PackedState } from "../../worker/src/schema.js";

export type ApplyHandler = (ops: OpSetVoxel[], version: number) => void;
export type PresenceHandler = (
    players: Array<{ playerId: string; cursor?: [number, number, number] }>
) => void;

export function connect(
    slug: string,
    onApply: ApplyHandler,
    onWelcome: (state: { state: PackedState; playerId: string; version: number }) => void,
    onPresence?: PresenceHandler
) {
    // In development, connect directly to the worker port
    const workerHost = location.hostname === "localhost" ? "localhost:8787" : location.host;
    const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${workerHost}/api/room/${slug}/ws`
    );
    const playerId = localStorage.getItem("playerId") || undefined;

    ws.onopen = () =>
        ws.send(
            JSON.stringify({
                type: "hello",
                playerId,
                clientClock: Date.now(),
            })
        );
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "welcome") {
            if (msg.playerId) localStorage.setItem("playerId", msg.playerId);
            onWelcome(msg);
        } else if (msg.type === "apply") {
            onApply(msg.ops, msg.version);
        } else if (msg.type === "presence" && onPresence) {
            onPresence(msg.players);
        }
    };

    function setOps(ops: OpSetVoxel[]) {
        ws.send(JSON.stringify({ type: "set", ops }));
    }

    function sendPresence(cursor: [number, number, number] | null) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "presence", cursor }));
        }
    }

    return { ws, setOps, sendPresence };
}
