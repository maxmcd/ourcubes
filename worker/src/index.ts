import { VoxelRoomDO } from "./room";
import type { Env, StaticRoomData } from "./schema";

export default {
    async fetch(req: Request, env: Env) {
        const url = new URL(req.url);

        // Handle API routes for rooms
        const apiMatch = url.pathname.match(/^\/api\/room\/([\w-]+)\/(ws|state|seed|freeze)$/);
        if (apiMatch) {
            const [, slug, action] = apiMatch;

            // Check if room is static (for read-only operations)
            if (action === "state" || action === "ws") {
                const staticRoom = await env.STATIC_ROOMS.get(`static:${slug}`);
                console.log(`Checking for static room: static:${slug}, found: ${!!staticRoom}`);
                if (staticRoom) {
                    console.log(`Serving static room data for ${slug}`);
                    const roomData = JSON.parse(staticRoom) as StaticRoomData;

                    if (action === "state") {
                        return Response.json({
                            version: roomData.version,
                            voxels: roomData.voxels,
                            isStatic: true,
                            frozenAt: roomData.frozenAt,
                        });
                    }

                    if (action === "ws") {
                        // For static rooms, create a read-only WebSocket connection
                        const [client, server] = Object.values(new WebSocketPair()) as [
                            WebSocket,
                            WebSocket,
                        ];
                        server.accept();

                        // Send welcome message with static data and immediately close
                        server.send(
                            JSON.stringify({
                                type: "welcome",
                                playerId: "static-viewer",
                                state: roomData.voxels,
                                version: roomData.version,
                                isStatic: true,
                            })
                        );

                        // Close the connection since static rooms don't support real-time updates
                        server.close(1000, "Static room - read only");

                        return new Response(null, { status: 101, webSocket: client });
                    }
                }
            }

            // For non-static rooms or freeze operations, route to DO
            const id = env.VOXEL_ROOM.idFromName(slug);
            const stub = env.VOXEL_ROOM.get(id);
            return stub.fetch(
                new Request(new URL(`/api/room/${slug}/${action}`, "http://do").toString(), req)
            );
        }

        // For client-side routing, serve index.html for room routes
        if (url.pathname.startsWith("/room/")) {
            return new Response("Client-side app should be served here", { status: 200 });
        }

        // Default response for root and other routes
        return new Response("ourcubes API - Visit the web app to start building!", {
            status: 200,
            headers: { "Content-Type": "text/plain" },
        });
    },
};

export { VoxelRoomDO };
