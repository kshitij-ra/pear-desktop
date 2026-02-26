import { createRoute } from '@hono/zod-openapi';

import { type NodeWebSocket } from '@hono/node-ws';

import {
  registerCallback,
  type SongInfo,
  SongInfoEvent,
} from '@/providers/song-info';

import { API_VERSION } from '../api-version';

import type { WSContext } from 'hono/ws';
import type { Context, Next } from 'hono';
import type { LikeType, RepeatMode, VolumeState } from '@/types/datahost-get-state';
import type { HonoApp } from '../types';
import type { BackendContext } from '@/types/contexts';
import type { APIServerConfig } from '@/plugins/api-server/config';

enum DataTypes {
  PlayerInfo = 'PLAYER_INFO',
  VideoChanged = 'VIDEO_CHANGED',
  PlayerStateChanged = 'PLAYER_STATE_CHANGED',
  PositionChanged = 'POSITION_CHANGED',
  VolumeChanged = 'VOLUME_CHANGED',
  RepeatChanged = 'REPEAT_CHANGED',
  ShuffleChanged = 'SHUFFLE_CHANGED',
  QueueChanged = 'QUEUE_CHANGED',
  LikeChanged = 'LIKE_CHANGED',
}

type PlayerState = {
  song?: SongInfo;
  isPlaying: boolean;
  muted: boolean;
  position: number;
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  likeStatus: LikeType | undefined;
};

export const register = (
  app: HonoApp,
  { ipc }: BackendContext<APIServerConfig>,
  { upgradeWebSocket }: NodeWebSocket,
  getSongInfo: () => SongInfo | undefined,
  getRepeatMode: () => RepeatMode,
  getShuffle: () => boolean,
  getLikeState: () => LikeType | undefined,
  getVolumeState: () => VolumeState | undefined,
) => {
  const sockets = new Set<WSContext<WebSocket>>();

  const send = (type: DataTypes, state: Partial<PlayerState>) => {
    sockets.forEach((socket) =>
      socket.send(JSON.stringify({ type, ...state })),
    );
  };

  const createPlayerState = ({
    songInfo,
    volumeState,
    repeat,
    shuffle,
    likeStatus,
  }: {
    songInfo?: SongInfo;
    volumeState?: VolumeState;
    repeat: RepeatMode;
    shuffle: boolean;
    likeStatus?: LikeType;
  }): PlayerState => ({
    song: songInfo,
    isPlaying: songInfo ? !songInfo.isPaused : false,
    muted: volumeState?.isMuted ?? false,
    position: songInfo?.elapsedSeconds ?? 0,
    volume: volumeState?.state ?? 100,
    repeat,
    shuffle,
    likeStatus,
  });

  registerCallback((songInfo, event) => {
    if (event === SongInfoEvent.VideoSrcChanged) {
      send(DataTypes.VideoChanged, {
        song: songInfo,
        position: 0,
        isPlaying: !songInfo.isPaused,
      });
    }

    if (event === SongInfoEvent.PlayOrPaused) {
      send(DataTypes.PlayerStateChanged, {
        isPlaying: !(songInfo?.isPaused ?? true),
        position: songInfo.elapsedSeconds,
      });
    }

    if (event === SongInfoEvent.TimeChanged) {
      send(DataTypes.PositionChanged, { position: songInfo.elapsedSeconds });
    }
  });

  ipc.on('peard:volume-changed', (newVolumeState: VolumeState) => {
    send(DataTypes.VolumeChanged, {
      volume: newVolumeState.state,
      muted: newVolumeState.isMuted,
    });
  });

  ipc.on('peard:repeat-changed', (mode: RepeatMode) => {
    send(DataTypes.RepeatChanged, { repeat: mode });
  });

  ipc.on('peard:seeked', (t: number) => {
    send(DataTypes.PositionChanged, { position: t });
  });

  ipc.on('peard:shuffle-changed', (newShuffle: boolean) => {
    send(DataTypes.ShuffleChanged, { shuffle: newShuffle });
  });

  ipc.on('peard:queue-changed', () => {
    send(DataTypes.QueueChanged, {});
  });

  ipc.on('peard:like-changed', (like: LikeType) => {
    send(DataTypes.LikeChanged, { likeStatus: like });
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: `/api/${API_VERSION}/ws`,
      summary: 'websocket endpoint',
      description: 'WebSocket endpoint for real-time updates',
      responses: {
        101: {
          description: 'Switching Protocols',
        },
      },
    }),
    upgradeWebSocket(() => ({
      onOpen(_, ws) {
        // "Unsafe argument of type `WSContext<WebSocket>` assigned to a parameter of type `WSContext<WebSocket>`. (@typescript-eslint/no-unsafe-argument)" ????? what?
        sockets.add(ws as WSContext<WebSocket>);

        ws.send(
          JSON.stringify({
            type: DataTypes.PlayerInfo,
            ...createPlayerState({
              songInfo: getSongInfo(),
              volumeState: getVolumeState(),
              repeat: getRepeatMode(),
              shuffle: getShuffle(),
              likeStatus: getLikeState(),
            }),
          }),
        );
      },

      onClose(_, ws) {
        sockets.delete(ws as WSContext<WebSocket>);
      },
    })) as (ctx: Context, next: Next) => Promise<Response>,
  );
};
