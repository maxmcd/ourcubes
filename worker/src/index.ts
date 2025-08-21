import { VoxelRoomDO } from "./room";
import { Env } from "./schema";

export default {
    async fetch(req: Request, env: Env) {
        const url = new URL(req.url);
        const match = url.pathname.match(/^\/api\/room\/([\w-]+)\/(ws|state|seed)$/);
        if (match) {
            const [, slug, action] = match;
            const id = env.VOXEL_ROOM.idFromName(slug);
            const stub = env.VOXEL_ROOM.get(id);
            return stub.fetch(
                new Request(
                    new URL(`/api/room/${slug}/${action}`, "http://do").toString(),
                    req
                )
            );
        }
        // static assets (if bundling UI with worker) or redirect to Pages site
        return new Response("ok", { status: 200 });
    },
};

export { VoxelRoomDO };