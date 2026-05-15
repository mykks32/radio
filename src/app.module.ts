import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { RadioModule } from './radio/radio.module'
import { Config } from './config'
import { ConfigModule } from '@nestjs/config'
import { RedisModule } from './redis/redis.module'
import { KafkaModule } from './kafka/kafka.module'
import { ScheduleModule } from '@nestjs/schedule'
import { QueueModule } from './queue/queue.module'
// import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware'

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [`${process.env.NODE_ENV}.env`, '.env'],
      isGlobal: true,
      load: Config,
    }),
    ScheduleModule.forRoot(),
    RadioModule,
    RedisModule,
    KafkaModule,
    QueueModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
