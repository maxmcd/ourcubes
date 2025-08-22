import { useState } from "react";

interface HomePageProps {
    onJoinRoom: (roomName: string) => void;
}

export function HomePage({ onJoinRoom }: HomePageProps) {
    const [roomName, setRoomName] = useState("");

    // Game color palette
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
    ];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (roomName.trim()) {
            onJoinRoom(
                roomName
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")
            );
        }
    };

    const handleQuickJoin = (room: string) => {
        onJoinRoom(room);
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                background: `linear-gradient(135deg, ${colors[0]}22, ${colors[9]}22)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
            }}
        >
            <div
                style={{
                    background: "rgba(255, 255, 255, 0.95)",
                    borderRadius: "16px",
                    padding: "40px",
                    maxWidth: "500px",
                    width: "100%",
                    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1)",
                    textAlign: "center",
                }}
            >
                {/* Logo/Title */}
                <h1
                    style={{
                        fontSize: "3.5rem",
                        fontWeight: "bold",
                        marginBottom: "8px",
                        background: `linear-gradient(45deg, ${colors[0]}, ${colors[4]}, ${colors[6]}, ${colors[9]})`,
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                    }}
                >
                    ourcubes
                </h1>

                <p
                    style={{
                        color: "#666",
                        fontSize: "1.1rem",
                        marginBottom: "32px",
                        lineHeight: 1.5,
                    }}
                >
                    Build together in 3D space.
                    <br />
                    Create, collaborate, and share voxel art.
                </p>

                {/* Color palette preview */}
                <div
                    style={{
                        display: "flex",
                        gap: "4px",
                        justifyContent: "center",
                        marginBottom: "32px",
                    }}
                >
                    {colors.map((color) => (
                        <div
                            key={color}
                            style={{
                                width: "24px",
                                height: "24px",
                                backgroundColor: color,
                                borderRadius: "4px",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                            }}
                        />
                    ))}
                </div>

                {/* Join room form */}
                <form onSubmit={handleSubmit} style={{ marginBottom: "24px" }}>
                    <div style={{ marginBottom: "16px" }}>
                        <input
                            type="text"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                            placeholder="Enter room name..."
                            style={{
                                width: "100%",
                                padding: "12px 16px",
                                fontSize: "1rem",
                                border: "2px solid #e5e5e5",
                                borderRadius: "8px",
                                outline: "none",
                                transition: "border-color 0.2s",
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = colors[6];
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = "#e5e5e5";
                            }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!roomName.trim()}
                        style={{
                            width: "100%",
                            padding: "12px 24px",
                            fontSize: "1.1rem",
                            fontWeight: "600",
                            color: "white",
                            background: roomName.trim()
                                ? `linear-gradient(45deg, ${colors[6]}, ${colors[4]})`
                                : "#ccc",
                            border: "none",
                            borderRadius: "8px",
                            cursor: roomName.trim() ? "pointer" : "not-allowed",
                            transition: "all 0.2s",
                            transform: "translateY(0)",
                        }}
                        onMouseEnter={(e) => {
                            if (roomName.trim()) {
                                e.currentTarget.style.transform = "translateY(-2px)";
                                e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.15)";
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "none";
                        }}
                    >
                        Join Room
                    </button>
                </form>

                {/* Quick join options */}
                <div>
                    <p
                        style={{
                            color: "#999",
                            fontSize: "0.9rem",
                            marginBottom: "12px",
                        }}
                    >
                        or try these rooms:
                    </p>
                    <div
                        style={{
                            display: "flex",
                            gap: "8px",
                            justifyContent: "center",
                            flexWrap: "wrap",
                        }}
                    >
                        {["loud", "soft", "fuzzy"].map((room) => (
                            <button
                                key={room}
                                type="button"
                                onClick={() => handleQuickJoin(room)}
                                style={{
                                    padding: "6px 12px",
                                    fontSize: "0.9rem",
                                    color: colors[8],
                                    background: "transparent",
                                    border: `1px solid ${colors[8]}`,
                                    borderRadius: "20px",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = colors[8];
                                    e.currentTarget.style.color = "white";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                    e.currentTarget.style.color = colors[8];
                                }}
                            >
                                {room}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
