import { useEffect, useState } from "react";
import { GameRoom } from "./components/GameRoom.js";
import { HomePage } from "./components/HomePage.js";

type AppState = { view: "home" } | { view: "room"; roomSlug: string };

export function App() {
    const [appState, setAppState] = useState<AppState>({ view: "home" });

    // Handle URL routing
    useEffect(() => {
        const handlePopState = () => {
            const path = window.location.pathname;
            const roomMatch = path.match(/^\/room\/([a-z0-9-]+)$/);

            if (roomMatch) {
                setAppState({ view: "room", roomSlug: roomMatch[1] });
            } else {
                setAppState({ view: "home" });
            }
        };

        // Handle initial route
        handlePopState();

        // Listen for browser back/forward
        window.addEventListener("popstate", handlePopState);

        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    const handleJoinRoom = (roomSlug: string) => {
        const sanitizedRoomSlug = roomSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        window.history.pushState({}, "", `/room/${sanitizedRoomSlug}`);
        setAppState({ view: "room", roomSlug: sanitizedRoomSlug });
    };

    const handleLeaveRoom = () => {
        window.history.pushState({}, "", "/");
        setAppState({ view: "home" });
    };

    if (appState.view === "home") {
        return <HomePage onJoinRoom={handleJoinRoom} />;
    }

    return <GameRoom roomSlug={appState.roomSlug} onLeaveRoom={handleLeaveRoom} />;
}
