import { RedisConfig } from './redis.config';
import { IceCastConfig } from './icecast.config';
import { KafkaConfig } from './kafka.config';
import { RadioConfig } from './radio.config';

export const Config = [IceCastConfig, RedisConfig, KafkaConfig, RadioConfig];
