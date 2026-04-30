import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RadioModule } from './radio/radio.module';
import { Config } from './config';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import { KafkaModule } from './kafka/kafka.module';
import { TaxiModule } from './taxi/taxi.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      load: Config,
    }),
    RadioModule,
    RedisModule,
    KafkaModule,
    TaxiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
