import React, { useEffect, useRef, useState } from 'react';
import { VoxelScene } from './three/scene.js';
import { connect } from './net/ws.js';
import { unpack, key } from './three/voxels.js';

export function App() {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<VoxelScene | null>(null);
    const [currentColor, setCurrentColor] = useState('#ff0000');
    const [connected, setConnected] = useState(false);
    const [roomSlug] = useState('demo');
    const wsRef = useRef<any>(null);
    const [voxelState, setVoxelState] = useState(new Map<number, string>());
    const [myPlayerId, setMyPlayerId] = useState<string>('');
    
    const colors = [
        '#FF6B9D', // Bright pink
        '#FF9F40', // Bright orange
        '#FFE066', // Bright yellow
        '#4ECDC4', // Bright teal
        '#45B7D1', // Bright blue
        '#96CEB4', // Bright mint
        '#FFEAA7', // Bright cream
        '#DDA0DD', // Bright plum
        '#98D8C8', // Bright aqua
        '#F7DC6F', // Bright gold
        '#BB8FCE', // Bright lavender
        '#85C1E9'  // Bright sky
    ];

    useEffect(() => {
        if (!containerRef.current) return;

        const scene = new VoxelScene(containerRef.current);
        sceneRef.current = scene;

        scene.setCurrentColor(currentColor);
        scene.setOnVoxelClick((k, color) => {
            // Optimistic update
            setVoxelState(currentVoxels => {
                const newVoxels = new Map(currentVoxels);
                if (color === null) {
                    newVoxels.delete(k);
                } else {
                    newVoxels.set(k, color);
                }
                return newVoxels;
            });

            if (wsRef.current) {
                const ops = [{
                    type: "set",
                    k,
                    color,
                    t: Date.now(),
                    by: localStorage.getItem("playerId")
                }];
                wsRef.current.setOps(ops);
            }
        });

        const { ws, setOps, sendPresence } = connect(
            roomSlug,
            (ops, version) => {
                // Apply operations from server
                setVoxelState(currentVoxels => {
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
                setMyPlayerId(welcomeMsg.playerId);
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
        <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ 
                padding: '10px', 
                background: '#f0f0f0', 
                color: '#333', 
                display: 'flex', 
                alignItems: 'center',
                gap: '10px',
                borderBottom: '1px solid #ddd'
            }}>
                <span>Status: {connected ? 'Connected' : 'Connecting...'}</span>
                <span>Room: {roomSlug}</span>
                <span>Color:</span>
                <input 
                    type="color" 
                    value={currentColor} 
                    onChange={(e) => setCurrentColor(e.target.value)}
                    style={{ width: '40px', height: '30px' }}
                />
                <div style={{ display: 'flex', gap: '5px' }}>
                    {colors.map(color => (
                        <div
                            key={color}
                            onClick={() => setCurrentColor(color)}
                            style={{
                                width: '30px',
                                height: '30px',
                                backgroundColor: color,
                                border: color === currentColor ? '3px solid #333' : '1px solid #ccc',
                                cursor: 'pointer'
                            }}
                        />
                    ))}
                </div>
            </div>
            <div ref={containerRef} style={{ flex: 1 }} />
            <div style={{ 
                padding: '10px', 
                background: '#f0f0f0', 
                color: '#666', 
                fontSize: '12px',
                borderTop: '1px solid #ddd'
            }}>
                Left click to place voxel • Ctrl+click or right click to erase • Drag to rotate • Wheel to zoom
            </div>
        </div>
    );
}