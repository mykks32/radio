import { RedisConfig } from './redis.config';
import { IceCastConfig } from './icecast.config';
import { KafkaConfig } from './kafka.config';
import { HlsConfig } from './hls.config';
import { LiquidsoapConfig } from './liquidsoap.config';

export const Config = [
  IceCastConfig,
  RedisConfig,
  KafkaConfig,
  HlsConfig,
  LiquidsoapConfig,
];
