export type VoxelKey = number; // 0..7999
export type ColorHex = string; // "#RRGGBB"

export interface Voxel {
    color: ColorHex;
    t: number; // lamport timestamp for LWW
    by?: string; // optional playerId attribution
}

export interface CanvasState {
    size: 20; // fixed
    voxels: Map<VoxelKey, Voxel>; // only non-empty entries stored
    lamport: number; // DO-wide logical clock
    version: number; // increments on write
}

export interface OpSetVoxel {
    type: "set";
    k: VoxelKey;
    color: ColorHex | null; // null means clear
    t: number; // client-supplied lamport (will be maxed by DO)
    by?: string; // playerId
}

export type PackedState = [VoxelKey, string][]; // color hex; empty voxels omitted

export interface PlayerPresence {
    playerId: string;
    cursor?: [number, number, number]; // x, y, z position of cursor/hover
}

export type ClientMsg =
    | { type: "hello"; playerId?: string; clientClock?: number }
    | { type: "set"; ops: OpSetVoxel[] } // batch for latency/burst
    | { type: "ping"; at: number }
    | { type: "presence"; cursor?: [number, number, number] }; // cursor position

export type ServerMsg =
    | { type: "welcome"; playerId: string; state: PackedState; version: number }
    | { type: "apply"; ops: OpSetVoxel[]; version: number } // authoritative
    | { type: "reject"; reason: string; retryAfterMs?: number }
    | { type: "pong"; at: number; now: number }
    | { type: "presence"; players: PlayerPresence[] };

export interface Env {
    VOXEL_ROOM: DurableObjectNamespace;
    ROOM_SEED_SECRET?: string;
}
