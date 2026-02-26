import indexHtml from '../assets/index.html?raw';
import controlCss from '../assets/css/control.css?raw';
import mainJs from '../assets/js/main.js?raw';

import { OpenAPIHono as Hono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { createServer as createHttpServer } from 'node:http';

import { createBackend } from '@/utils';

import type { WebUIConfig } from '../config';

export interface WebUIBackendType {
    app?: Hono;
    server?: ReturnType<typeof serve>;
    oldConfig?: WebUIConfig;
    currentConfig?: WebUIConfig;

    init: (config: WebUIConfig) => void;
    run: (config: WebUIConfig) => void;
    end: () => void;
}

export const backend = createBackend<WebUIBackendType, WebUIConfig>({
    async start(ctx) {
        const config = await ctx.getConfig();

        this.init(config);
        this.run(config);
    },

    stop() {
        this.end();
    },

    onConfigChange(config) {
        const old = this.oldConfig;
        if (
            old?.hostname === config.hostname &&
            old?.port === config.port &&
            old?.apiServerPort === config.apiServerPort
        ) {
            this.oldConfig = config;
            return;
        }

        this.end();
        this.init(config);
        this.run(config);
        this.oldConfig = config;
    },

    init(config) {
        this.app = new Hono();
        this.currentConfig = config;

        this.app.use('*', cors());

        // for web remote control
        this.app.use('*', async (ctx, next) => {
            ctx.header('Access-Control-Request-Private-Network', 'true');
            await next();
        });

        // Serve configuration endpoint
        this.app.get('/config.js', (ctx) => {
            const configJs = `window.API_SERVER_PORT = ${config.apiServerPort};`;
            ctx.header('Content-Type', 'text/javascript');
            return ctx.body(configJs);
        });

        // Serve static UI files
        this.app.get('/', (ctx) => {
            // Inject config script into HTML
            const htmlWithConfig = indexHtml.replace(
                '</head>',
                '    <script src="/config.js"></script>\n</head>'
            );
            return ctx.html(htmlWithConfig);
        });

        this.app.get('/assets/css/control.css', (ctx) => {
            ctx.header('Content-Type', 'text/css');
            return ctx.body(controlCss);
        });

        this.app.get('/assets/js/main.js', (ctx) => {
            ctx.header('Content-Type', 'text/javascript');
            return ctx.body(mainJs);
        });
    },

    run(config) {
        if (!this.app) return;

        try {
            const serveOptions = {
                fetch: this.app.fetch.bind(this.app),
                port: config.port,
                hostname: config.hostname,
                createServer: createHttpServer,
            };

            this.server = serve(serveOptions);
        } catch (err) {
            console.error('[Web UI] Failed to start server:', err);
        }
    },

    end() {
        this.server?.close();
        this.server = undefined;
    },
});
