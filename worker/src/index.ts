import { VoxelRoomDO } from "./room";
import type { Env } from "./schema";

export default {
    async fetch(req: Request, env: Env) {
        const url = new URL(req.url);

        // Handle API routes for rooms
        const apiMatch = url.pathname.match(/^\/api\/room\/([\w-]+)\/(ws|state|seed)$/);
        if (apiMatch) {
            const [, slug, action] = apiMatch;
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
