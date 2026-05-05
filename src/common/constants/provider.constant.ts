export const PROVIDER = {
  redis: 'REDIS_PROVIDER',
} as const;

export const WS_EVENTS = {
  // Connection
  CONNECTED: 'connected',

  TRACK_START: 'track_start',
  TRACK_ENDED: 'track_ended',
} as const;
