import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { type RedisClientType } from 'redis'
import { PROVIDER } from '../common/constants/provider.constant'

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private isShuttingDown = false

  constructor(
    @Inject(PROVIDER.redis)
    private readonly client: RedisClientType,
  ) {}

  async onModuleDestroy() {
    if (this.isShuttingDown) return
    this.isShuttingDown = true

    try {
      if (this.client?.isOpen) {
        await this.client.quit()
        this.logger.log('Redis disconnected successfully')
      } else {
        this.logger.warn('Redis already closed')
      }
    } catch (err) {
      this.logger.error('Redis shutdown error', err)
    }
  }
}
