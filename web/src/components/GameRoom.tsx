import { useEffect, useRef, useState } from "react";
import type { OpSetVoxel } from "../../../worker/src/schema.js";
import { connect } from "../net/ws.js";
import { VoxelScene } from "../three/scene.js";
import { unpack } from "../three/voxels.js";

interface GameRoomProps {
    roomSlug: string;
    onLeaveRoom: () => void;
}

export function GameRoom({ roomSlug, onLeaveRoom }: GameRoomProps) {
    // https://coolors.co/palette/f94144-f3722c-f8961e-f9844a-f9c74f-90be6d-43aa8b-4d908e-577590-277da1
    const colors = [
        "#f94144",
        "#f3722c",
        "#f8961e",
        "#f9844a",
        "#f9c74f",
        "#90be6d",
        "#43aa8b",
        "#4d908e",
        "#577590",
        "#277da1",
        "#000000",
        "#ffffff",
    ];
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<VoxelScene | null>(null);
    const [currentColor, setCurrentColor] = useState(
        colors[Math.floor(Math.random() * colors.length)]
    );
    const [connected, setConnected] = useState(false);
    const wsRef = useRef<{ setOps: (ops: OpSetVoxel[]) => void } | null>(null);
    const [voxelState, setVoxelState] = useState(new Map<number, string>());

    useEffect(() => {
        if (!containerRef.current) return;

        const scene = new VoxelScene(containerRef.current);
        sceneRef.current = scene;

        scene.setCurrentColor(currentColor);
        scene.setOnVoxelClick((k, color) => {
            // Optimistic update
            setVoxelState((currentVoxels) => {
                const newVoxels = new Map(currentVoxels);
                if (color === null) {
                    newVoxels.delete(k);
                } else {
                    newVoxels.set(k, color);
                }
                return newVoxels;
            });

            if (wsRef.current) {
                const ops = [
                    {
                        type: "set",
                        k,
                        color,
                        t: Date.now(),
                        by: localStorage.getItem("playerId"),
                    },
                ];
                wsRef.current.setOps(ops);
            }
        });

        const { ws, setOps, sendPresence } = connect(
            roomSlug,
            (ops) => {
                // Apply operations from server
                setVoxelState((currentVoxels) => {
                    const newVoxels = new Map(currentVoxels);
                    for (const op of ops) {
                        if (op.color === null) {
                            newVoxels.delete(op.k);
                        } else {
                            newVoxels.set(op.k, op.color);
                        }
                    }
                    return newVoxels;
                });
            },
            (welcomeMsg) => {
                setConnected(true);
                const voxelMap = unpack(welcomeMsg.state);
                setVoxelState(voxelMap);
            },
            (players) => {
                // Handle presence updates
                const currentPlayerId = localStorage.getItem("playerId") || "";
                if (sceneRef.current && currentPlayerId) {
                    sceneRef.current.updatePlayerPresence(players, currentPlayerId);
                }
            }
        );

        wsRef.current = { setOps };

        // Set up cursor movement handling
        scene.setOnCursorMove((cursor) => {
            sendPresence(cursor);
        });

        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);
            scene.render();
        };
        animate();

        return () => {
            ws.close();
        };
    }, [roomSlug]);

    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.setCurrentColor(currentColor);
        }
    }, [currentColor]);

    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.updateVoxels(voxelState);
        }
    }, [voxelState]);

    return (
        <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
            <div
                style={{
                    padding: "10px",
                    background: "#f0f0f0",
                    color: "#333",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    borderBottom: "1px solid #ddd",
                }}
            >
                <button
                    type="button"
                    onClick={onLeaveRoom}
                    style={{
                        padding: "6px 12px",
                        background: "#577590",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "500",
                    }}
                >
                    ← Leave
                </button>
                <span style={{ fontWeight: "600", color: "#577590" }}>ourcubes</span>
                <span>•</span>
                <span>Status: {connected ? "Connected" : "Connecting..."}</span>
                <span>•</span>
                <span>
                    Room: <strong>{roomSlug}</strong>
                </span>
                <span style={{ marginLeft: "auto" }}>Color:</span>
                <input
                    type="color"
                    value={currentColor}
                    onChange={(e) => setCurrentColor(e.target.value)}
                    style={{ width: "40px", height: "30px" }}
                />
                <div style={{ display: "flex", gap: "5px" }}>
                    {colors.map((color) => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => setCurrentColor(color)}
                            style={{
                                width: "30px",
                                height: "30px",
                                backgroundColor: color,
                                border:
                                    color === currentColor ? "3px solid #333" : "1px solid #ccc",
                                cursor: "pointer",
                                padding: 0,
                            }}
                            aria-label={`Select color ${color}`}
                        />
                    ))}
                </div>
            </div>
            <div ref={containerRef} style={{ flex: 1 }} />
            <div
                style={{
                    padding: "10px",
                    background: "#f0f0f0",
                    color: "#666",
                    fontSize: "12px",
                    borderTop: "1px solid #ddd",
                }}
            >
                Left click to place voxel • Ctrl+click or right click to erase • Drag to rotate •
                Wheel to zoom
            </div>
        </div>
    );
}
