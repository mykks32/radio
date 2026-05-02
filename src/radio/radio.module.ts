import { Module } from '@nestjs/common';
import { RadioController } from './radio.controller';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../queue/queue.constant';
import { KafkaModule } from '../kafka/kafka.module';
import { PlaylistModule } from '../playlist/playlist.module';
import { RadioService } from './services/radio.service';
import { RadioProcessor } from './processors/radio.processor';
import { RadioStreamService } from './services/radio-stream.service';
import { RadioGateway } from './radio.gateway';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE.RADIO_QUEUE,
    }),
    KafkaModule,
    PlaylistModule,
  ],
  controllers: [RadioController],
  providers: [RadioService, RadioStreamService, RadioProcessor, RadioGateway],
  exports: [RadioService],
})
export class RadioModule {}
