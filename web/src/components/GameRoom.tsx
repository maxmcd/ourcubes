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
        "ERASER", // Special eraser value
    ];
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<VoxelScene | null>(null);
    const [currentColor, setCurrentColor] = useState(
        colors[Math.floor(Math.random() * colors.length)]
    );
    const [connected, setConnected] = useState(false);
    const wsRef = useRef<{ setOps: (ops: OpSetVoxel[]) => void } | null>(null);
    const [voxelState, setVoxelState] = useState(new Map<number, string>());
    const [isStatic, setIsStatic] = useState(false);
    const [isFreezing, setIsFreezing] = useState(false);

    // biome-ignore lint/correctness/useExhaustiveDependencies: currentColor intentionally not in deps to avoid scene recreation
    useEffect(() => {
        if (!containerRef.current) return;

        const scene = new VoxelScene(containerRef.current);
        sceneRef.current = scene;

        // Initialize with current color - this is intentionally not in dependency array
        // to avoid recreating scene on color changes
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
                const ops: OpSetVoxel[] = [
                    {
                        type: "set" as const,
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

                // Check if this is a static room
                // biome-ignore lint/suspicious/noExplicitAny: Welcome message type doesn't include isStatic property
                if ((welcomeMsg as any).isStatic) {
                    setIsStatic(true);
                }
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

    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.setEditingEnabled(!isStatic);
        }
    }, [isStatic]);

    const handleFreezeRoom = async () => {
        if (isFreezing || isStatic) return;

        setIsFreezing(true);
        try {
            const response = await fetch(`/api/room/${roomSlug}/freeze`, {
                method: "POST",
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    setIsStatic(true);
                    alert("Room saved statically! This room is now read-only.");
                } else {
                    alert(`Failed to save room: ${result.message}`);
                }
            } else {
                alert("Failed to save room");
            }
        } catch (error) {
            console.error("Error freezing room:", error);
            alert("Error saving room");
        } finally {
            setIsFreezing(false);
        }
    };

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
                {!isStatic && (
                    <button
                        type="button"
                        onClick={handleFreezeRoom}
                        disabled={isFreezing}
                        style={{
                            padding: "6px 12px",
                            background: isFreezing ? "#ccc" : "#f9844a",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: isFreezing ? "not-allowed" : "pointer",
                            fontSize: "12px",
                            fontWeight: "500",
                            marginLeft: "8px",
                        }}
                    >
                        {isFreezing ? "Saving..." : "Save Static"}
                    </button>
                )}
                <span style={{ fontWeight: "600", color: "#577590" }}>ourcubes</span>
                <span>•</span>
                <span>
                    Status:{" "}
                    {isStatic ? "Static (Read-Only)" : connected ? "Connected" : "Connecting..."}
                </span>
                <span>•</span>
                <span>
                    Room: <strong>{roomSlug}</strong>
                    {isStatic && <span style={{ color: "#f9844a", marginLeft: "4px" }}>🔒</span>}
                </span>
                {!isStatic && (
                    <>
                        <span style={{ marginLeft: "auto" }}>Color:</span>
                        {currentColor === "ERASER" ? (
                            <div
                                style={{
                                    width: "40px",
                                    height: "30px",
                                    background:
                                        "repeating-linear-gradient(45deg, transparent, transparent 2px, #999 2px, #999 4px)",
                                    border: "1px solid #999",
                                    borderRadius: "2px",
                                }}
                            />
                        ) : (
                            <input
                                type="color"
                                value={currentColor}
                                onChange={(e) => setCurrentColor(e.target.value)}
                                style={{ width: "40px", height: "30px" }}
                            />
                        )}
                    </>
                )}
                {!isStatic && (
                    <div style={{ display: "flex", gap: "5px" }}>
                        {colors.map((color) => (
                            <button
                                key={color}
                                type="button"
                                onClick={() => setCurrentColor(color)}
                                style={{
                                    width: "30px",
                                    height: "30px",
                                    backgroundColor: color === "ERASER" ? "#e0e0e0" : color,
                                    border:
                                        color === currentColor
                                            ? "3px solid #333"
                                            : "1px solid #ccc",
                                    cursor: "pointer",
                                    padding: 0,
                                    position: "relative",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "16px",
                                    fontWeight: "bold",
                                    color: "#666",
                                }}
                                aria-label={color === "ERASER" ? "Eraser" : `Select color ${color}`}
                            >
                                {color === "ERASER" ? (
                                    <div
                                        style={{
                                            width: "20px",
                                            height: "20px",
                                            background:
                                                "repeating-linear-gradient(45deg, transparent, transparent 2px, #999 2px, #999 4px)",
                                            border: "1px solid #999",
                                            borderRadius: "2px",
                                        }}
                                    />
                                ) : null}
                            </button>
                        ))}
                    </div>
                )}
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
                {isStatic
                    ? "Read-only static room • Drag to rotate • Wheel to zoom"
                    : "Left click to place voxel • Ctrl+click or right click to erase • Use ✕ eraser tool • Drag to rotate • Wheel to zoom"}
            </div>
        </div>
    );
}
