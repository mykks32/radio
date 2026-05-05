import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import { PROVIDER } from '../common/constants/provider.constant';
import { RedisRepository } from './redis.repository';

const logger = new Logger('RedisModule');

@Global()
@Module({
  providers: [
    {
      provide: PROVIDER.redis,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<RedisClientType> => {
        const redisUrl = config.getOrThrow<string>('redis.url');

        const client = createClient({
          url: redisUrl,
        });

        // events
        client.on('connect', () => logger.log('Redis connecting...'));
        client.on('ready', () => logger.log('Redis ready'));
        client.on('end', () => logger.warn('Redis connection closed'));
        client.on('error', (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`Redis error: ${message}`);
        });

        // connect
        await client.connect();

        logger.log('Redis client initialized successfully');

        return client as RedisClientType;
      },
    },
    RedisRepository,
  ],
  exports: [PROVIDER.redis, RedisRepository],
})
export class RedisModule {}
