import { getSongControls } from '@/providers/song-controls';

import { OpenAPIHono as Hono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { createNodeWebSocket } from '@hono/node-ws';

import { getSongInfo, registerCallback } from '@/providers/song-info';
import { createBackend } from '@/utils';

import { registerAuth, registerControl, registerWebsocket } from './routes';
import {
  corsMiddleware,
  privateNetworkMiddleware,
  jwtAuthMiddleware,
  authorizationMiddleware
} from './middleware';
import { createAndStartServer } from './server';

import { APPLICATION_NAME } from '@/i18n';

import { type APIServerConfig } from '../config';



import type { BackendType } from './types';
import type {
  LikeType,
  RepeatMode,
  VolumeState,
} from '@/types/datahost-get-state';

export const backend = createBackend<BackendType, APIServerConfig>({
  async start(ctx) {
    const config = await ctx.getConfig();

    this.init(ctx);
    this.songInfo = getSongInfo() ?? undefined;
    registerCallback((songInfo) => {
      this.songInfo = songInfo;
    });

    ctx.ipc.on('peard:player-api-loaded', () => {
      ctx.ipc.send('peard:setup-seeked-listener');
      ctx.ipc.send('peard:setup-time-changed-listener');
      ctx.ipc.send('peard:setup-repeat-changed-listener');
      ctx.ipc.send('peard:setup-like-changed-listener');
      ctx.ipc.send('peard:setup-volume-changed-listener');
      ctx.ipc.send('peard:setup-volume-changed-listener');
      ctx.ipc.send('peard:setup-shuffle-changed-listener');
      ctx.ipc.send('peard:setup-queue-changed-listener');

      const controller = getSongControls(ctx.window);
      controller.requestShuffleInformation();

      ctx.window.webContents
        .executeJavaScript(
          'document.querySelector("#like-button-renderer")?.likeStatus',
        )
        .then((like) => {
          this.likeState = like;
        });
    });

    ctx.ipc.on(
      'peard:repeat-changed',
      (mode: RepeatMode) => (this.currentRepeatMode = mode),
    );

    ctx.ipc.on(
      'peard:volume-changed',
      (newVolumeState: VolumeState) => (this.volumeState = newVolumeState),
    );

    ctx.ipc.on(
      'peard:like-changed',
      (like: LikeType) => (this.likeState = like),
    );

    ctx.ipc.on(
      'peard:shuffle-changed',
      (newShuffle: boolean) => (this.shuffle = newShuffle),
    );

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
      old?.useHttps === config.useHttps &&
      old?.certPath === config.certPath &&
      old?.keyPath === config.keyPath
    ) {
      this.oldConfig = config;
      return;
    }

    this.end();
    this.run(config);
    this.oldConfig = config;
  },

  // Custom
  init(backendCtx) {
    this.app = new Hono();

    const ws = createNodeWebSocket({
      app: this.app,
    });

    // Apply CORS and private network middlewares globally
    this.app.use('*', corsMiddleware());
    this.app.use('*', privateNetworkMiddleware);

    // Apply authentication and authorization middlewares to API routes
    this.app.use('/api/*', async (ctx, next) => {
      const config = await backendCtx.getConfig();
      return await jwtAuthMiddleware(config)(ctx, next);
    });
    this.app.use('/api/*', authorizationMiddleware(async () => await backendCtx.getConfig()));

    // routes
    registerControl(
      this.app,
      backendCtx,
      () => this.songInfo,
      () => this.currentRepeatMode,
      () =>
        backendCtx.window.webContents.executeJavaScript(
          'document.querySelector("#like-button-renderer")?.likeStatus',
        ) as Promise<LikeType>,
      () => this.volumeState,
    );
    registerAuth(this.app, backendCtx);
    registerWebsocket(
      this.app,
      backendCtx,
      ws,
      () => this.songInfo,
      () => this.currentRepeatMode ?? 'NONE',
      () => this.shuffle ?? false,
      () => this.likeState,
      () => this.volumeState,
    );

    // swagger
    this.app.openAPIRegistry.registerComponent(
      'securitySchemes',
      'bearerAuth',
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    );
    this.app.doc('/doc', {
      openapi: '3.1.0',
      info: {
        version: '1.0.0',
        title: `${APPLICATION_NAME} API Server`,
        description:
          'Note: You need to get an access token using the `/auth/{id}` endpoint first to call any API endpoints under `/api`.',
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
    });

    // Swagger UI for API documentation
    this.app.get('/swagger', swaggerUI({ url: '/doc' }));

    this.injectWebSocket = ws.injectWebSocket.bind(this);
  },
  run(config) {
    if (!this.app) return;

    this.server = createAndStartServer(this.app, config);

    if (this.injectWebSocket && this.server) {
      this.injectWebSocket(this.server);
    }
  },
  end() {
    this.server?.close();
    this.server = undefined;
  },
});
