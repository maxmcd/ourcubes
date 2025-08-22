import { describe, expect, it } from "vitest";
import type {
    CanvasState,
    ClientMsg,
    ColorHex,
    OpSetVoxel,
    PackedState,
    PlayerPresence,
    ServerMsg,
    Voxel,
    VoxelKey,
} from "./schema.js";

describe("Schema Types", () => {
    describe("VoxelKey", () => {
        it("should be a valid number within range", () => {
            const validKeys: VoxelKey[] = [0, 100, 7999];
            const invalidKeys: number[] = [-1, 8000, 10000];

            validKeys.forEach((key) => {
                expect(key).toBeGreaterThanOrEqual(0);
                expect(key).toBeLessThan(8000);
            });

            invalidKeys.forEach((key) => {
                expect(key < 0 || key >= 8000).toBe(true);
            });
        });
    });

    describe("ColorHex", () => {
        it("should accept valid hex color strings", () => {
            const validColors: ColorHex[] = ["#FF0000", "#00FF00", "#0000FF", "#000000", "#FFFFFF"];

            validColors.forEach((color) => {
                expect(color).toMatch(/^#[0-9A-F]{6}$/i);
            });
        });
    });

    describe("Voxel", () => {
        it("should have valid structure", () => {
            const voxel: Voxel = {
                color: "#FF0000",
                t: 123456789,
                by: "player123",
            };

            expect(voxel).toHaveProperty("color");
            expect(voxel).toHaveProperty("t");
            expect(voxel).toHaveProperty("by");
            expect(typeof voxel.color).toBe("string");
            expect(typeof voxel.t).toBe("number");
            expect(typeof voxel.by).toBe("string");
        });

        it("should allow optional by field", () => {
            const voxel: Voxel = {
                color: "#00FF00",
                t: 987654321,
            };

            expect(voxel).toHaveProperty("color");
            expect(voxel).toHaveProperty("t");
            expect(voxel).not.toHaveProperty("by");
        });
    });

    describe("CanvasState", () => {
        it("should have valid structure", () => {
            const canvasState: CanvasState = {
                size: 20,
                voxels: new Map<VoxelKey, Voxel>(),
                lamport: 0,
                version: 1,
            };

            expect(canvasState.size).toBe(20);
            expect(canvasState.voxels).toBeInstanceOf(Map);
            expect(typeof canvasState.lamport).toBe("number");
            expect(typeof canvasState.version).toBe("number");
        });
    });

    describe("OpSetVoxel", () => {
        it("should have valid structure for setting a voxel", () => {
            const op: OpSetVoxel = {
                type: "set",
                k: 1000,
                color: "#FF0000",
                t: 123456789,
                by: "player123",
            };

            expect(op.type).toBe("set");
            expect(typeof op.k).toBe("number");
            expect(typeof op.color).toBe("string");
            expect(typeof op.t).toBe("number");
            expect(typeof op.by).toBe("string");
        });

        it("should allow null color for clearing voxels", () => {
            const op: OpSetVoxel = {
                type: "set",
                k: 1000,
                color: null,
                t: 123456789,
            };

            expect(op.type).toBe("set");
            expect(op.color).toBeNull();
        });
    });

    describe("PackedState", () => {
        it("should be an array of tuples", () => {
            const packedState: PackedState = [
                [0, "#FF0000", 123],
                [1000, "#00FF00", 456],
                [7999, "#0000FF", 789],
            ];

            expect(Array.isArray(packedState)).toBe(true);
            packedState.forEach(([key, color, timestamp]) => {
                expect(typeof key).toBe("number");
                expect(typeof color).toBe("string");
                expect(typeof timestamp).toBe("number");
                expect(key).toBeGreaterThanOrEqual(0);
                expect(key).toBeLessThan(8000);
                expect(timestamp).toBeGreaterThan(0);
            });
        });
    });

    describe("PlayerPresence", () => {
        it("should have valid structure", () => {
            const presence: PlayerPresence = {
                playerId: "player123",
                cursor: [10, 5, 15],
            };

            expect(typeof presence.playerId).toBe("string");
            expect(Array.isArray(presence.cursor)).toBe(true);
            expect(presence.cursor?.length).toBe(3);
        });

        it("should allow optional cursor", () => {
            const presence: PlayerPresence = {
                playerId: "player123",
            };

            expect(typeof presence.playerId).toBe("string");
            expect(presence.cursor).toBeUndefined();
        });
    });

    describe("ClientMsg", () => {
        it("should support hello message", () => {
            const helloMsg: ClientMsg = {
                type: "hello",
                playerId: "player123",
                clientClock: Date.now(),
            };

            expect(helloMsg.type).toBe("hello");
        });

        it("should support set message", () => {
            const setMsg: ClientMsg = {
                type: "set",
                ops: [
                    {
                        type: "set",
                        k: 100,
                        color: "#FF0000",
                        t: Date.now(),
                    },
                ],
            };

            expect(setMsg.type).toBe("set");
            expect(Array.isArray(setMsg.ops)).toBe(true);
        });

        it("should support ping message", () => {
            const pingMsg: ClientMsg = {
                type: "ping",
                at: Date.now(),
            };

            expect(pingMsg.type).toBe("ping");
            expect(typeof pingMsg.at).toBe("number");
        });

        it("should support presence message", () => {
            const presenceMsg: ClientMsg = {
                type: "presence",
                cursor: [10, 5, 15],
            };

            expect(presenceMsg.type).toBe("presence");
            expect(Array.isArray(presenceMsg.cursor)).toBe(true);
        });
    });

    describe("ServerMsg", () => {
        it("should support welcome message", () => {
            const welcomeMsg: ServerMsg = {
                type: "welcome",
                playerId: "player123",
                state: [[0, "#FF0000", 123]],
                version: 1,
            };

            expect(welcomeMsg.type).toBe("welcome");
            if (welcomeMsg.type === "welcome") {
                expect(typeof welcomeMsg.playerId).toBe("string");
                expect(Array.isArray(welcomeMsg.state)).toBe(true);
                expect(typeof welcomeMsg.version).toBe("number");
            }
        });

        it("should support apply message", () => {
            const applyMsg: ServerMsg = {
                type: "apply",
                ops: [
                    {
                        type: "set",
                        k: 100,
                        color: "#FF0000",
                        t: Date.now(),
                    },
                ],
                version: 2,
            };

            expect(applyMsg.type).toBe("apply");
            expect(Array.isArray(applyMsg.ops)).toBe(true);
            expect(typeof applyMsg.version).toBe("number");
        });

        it("should support reject message", () => {
            const rejectMsg: ServerMsg = {
                type: "reject",
                reason: "rate",
                retryAfterMs: 1000,
            };

            expect(rejectMsg.type).toBe("reject");
            expect(typeof rejectMsg.reason).toBe("string");
            expect(typeof rejectMsg.retryAfterMs).toBe("number");
        });

        it("should support pong message", () => {
            const pongMsg: ServerMsg = {
                type: "pong",
                at: 123456789,
                now: Date.now(),
            };

            expect(pongMsg.type).toBe("pong");
            expect(typeof pongMsg.at).toBe("number");
            expect(typeof pongMsg.now).toBe("number");
        });

        it("should support presence message", () => {
            const presenceMsg: ServerMsg = {
                type: "presence",
                players: [
                    {
                        playerId: "player123",
                        cursor: [10, 5, 15],
                    },
                ],
            };

            expect(presenceMsg.type).toBe("presence");
            expect(Array.isArray(presenceMsg.players)).toBe(true);
        });
    });
});
