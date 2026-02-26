import { z } from '@hono/zod-openapi';

export const PlayNowSchema = z.object({
    videoId: z.string(),
});
