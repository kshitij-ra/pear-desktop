import { z } from '@hono/zod-openapi';

export const PlayPlaylistSchema = z.object({
    playlistId: z.string(),
});
