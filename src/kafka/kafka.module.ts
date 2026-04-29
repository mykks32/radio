import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaService } from './kafka.service';
import { DiscoveryModule } from '@nestjs/core';

const providers = [KafkaService];

@Global()
@Module({
  imports: [ConfigModule, DiscoveryModule],
  providers,
  exports: providers,
})
export class KafkaModule {}
