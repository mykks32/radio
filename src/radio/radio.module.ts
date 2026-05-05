import { Module } from '@nestjs/common';
import { RadioController } from './radio.controller';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../queue/queue.constant';
import { KafkaModule } from '../kafka/kafka.module';
import { PlaylistModule } from '../playlist/playlist.module';
import { RadioService } from './services/radio.service';
import { RadioProcessor } from './processors/radio.processor';
import { RadioStreamService } from './services/radio-stream.service';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { RadioGateway } from './gateways/radio.gateway';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE.RADIO_QUEUE,
    }),
    // Set up Bull Board root with Express adapter
    BullBoardModule.forRoot({
      route: '/api/queues',
      adapter: ExpressAdapter,
    }),

    // Register the specific queue to display
    BullBoardModule.forFeature({
      name: QUEUE.RADIO_QUEUE,
      adapter: BullMQAdapter,
    }),
    KafkaModule,
    PlaylistModule,
  ],
  controllers: [RadioController],
  providers: [RadioService, RadioStreamService, RadioProcessor, RadioGateway],
  exports: [RadioService],
})
export class RadioModule {}
