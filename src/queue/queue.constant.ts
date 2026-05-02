export const QUEUE = {
  RADIO_QUEUE: 'radio_queue',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];
