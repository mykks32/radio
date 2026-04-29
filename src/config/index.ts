import { RedisConfig } from './redis.config';
import { IceCastConfig } from './icecast.config';
import { KafkaConfig } from './kafka.config';

export const Config = [IceCastConfig, RedisConfig, KafkaConfig];
