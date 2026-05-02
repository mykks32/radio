export const KAFKA_TOPIC = {
  RADIO_EVENTS: 'radio.events',
} as const;

export const KAFKA_EVENT = {
  PLAYLIST_BUILT: 'PLAYLIST_BUILT',
  TRACKS_ADDED_MANUALLY: 'TRACKS_ADDED_MANUALLY',
  TRACK_STARTED: 'TRACK_STARTED',
  TRACK_ENDED: 'TRACK_ENDED',
} as const;

// types
export type KafkaTopic = (typeof KAFKA_TOPIC)[keyof typeof KAFKA_TOPIC];

export type KafkaEventType = (typeof KAFKA_EVENT)[keyof typeof KAFKA_EVENT];
