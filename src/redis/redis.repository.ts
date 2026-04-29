import { type RedisClientType } from 'redis';
import { Inject, Injectable } from '@nestjs/common';
import { PROVIDER } from '../common/constant';

@Injectable()
export class RedisRepository {
  constructor(
    @Inject(PROVIDER.redis)
    private readonly client: RedisClientType,
  ) {}

  async get(key: string) {
    return this.client.get(key);
  }

  async set(key: string, value: string) {
    return this.client.set(key, value);
  }
}
