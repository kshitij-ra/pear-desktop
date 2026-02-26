import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';

import type { APIServerConfig } from '../../config';
import type { HonoApp } from '../types';

/**
 * Create and start the HTTP/HTTPS server based on configuration
 */
export function createAndStartServer(app: HonoApp, config: APIServerConfig) {
    try {
        const serveOptions =
            config.useHttps && config.certPath && config.keyPath
                ? {
                    fetch: app.fetch.bind(app),
                    port: config.port,
                    hostname: config.hostname,
                    createServer: createHttpsServer,
                    serverOptions: {
                        key: readFileSync(config.keyPath),
                        cert: readFileSync(config.certPath),
                    },
                }
                : {
                    fetch: app.fetch.bind(app),
                    port: config.port,
                    hostname: config.hostname,
                    createServer: createHttpServer,
                };

        return serve(serveOptions);
    } catch (err) {
        console.error('[API Server] Failed to start:', err);
        return undefined;
    }
}
