import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaService } from './kafka.service';
import { DiscoveryModule } from '@nestjs/core';

@Global()
@Module({
  imports: [ConfigModule, DiscoveryModule],
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule {}
