import { jwt } from 'hono/jwt';
import { cors } from 'hono/cors';

import type { Context, Next } from 'hono';
import { type APIServerConfig, AuthStrategy } from '../../config';
import { JWTPayloadSchema } from '../scheme';

/**
 * CORS middleware - allows cross-origin requests
 */
export function corsMiddleware() {
    return cors();
}

/**
 * Private network access middleware
 * Required for web remote control from local network
 */
export async function privateNetworkMiddleware(ctx: Context, next: Next) {
    ctx.header('Access-Control-Request-Private-Network', 'true');
    await next();
}

/**
 * JWT authentication middleware
 * Only applied when auth strategy is not NONE
 */
export function jwtAuthMiddleware(config: APIServerConfig) {
    return async (ctx: Context, next: Next) => {
        const AuthStrategy = await import('../../config').then(m => m.AuthStrategy);

        if (config.authStrategy !== AuthStrategy.NONE) {
            return await jwt({
                secret: config.secret,
                alg: 'HS256',
            })(ctx, next);
        }
        await next();
    };
}

/**
 * Authorization middleware
 * Checks if the client is authorized to access the API
 */
export function authorizationMiddleware(getConfig: () => Promise<APIServerConfig>) {
    return async (ctx: Context, next: Next) => {
        const config = await getConfig();
        const result = await JWTPayloadSchema.spa(await ctx.get('jwtPayload'));

        const isAuthorized =
            config.authStrategy === AuthStrategy.NONE ||
            (result.success && config.authorizedClients.includes(result.data.id));

        if (!isAuthorized) {
            ctx.status(401);
            return ctx.body('Unauthorized');
        }

        return await next();
    };
}
