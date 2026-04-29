import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

export type RedisConfigType = {
  url: string;
};

const logger = new Logger('RedisConfig');

export const RedisConfig = registerAs('redis', (): RedisConfigType => {
  const url = process.env.REDIS_URL;

  if (!url) {
    logger.error('REDIS_URL is missing');
    throw new Error('Redis URL is required');
  }

  logger.log(`Redis connected → ${url.split('@')[1]}`);

  return {
    url,
  };
});
