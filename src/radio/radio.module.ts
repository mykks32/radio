import { Module } from '@nestjs/common'
import { RadioController } from './controllers/radio.controller'
import { BullModule } from '@nestjs/bullmq'
import { QUEUE } from '../queue/queue.constant'
import { KafkaModule } from '../kafka/kafka.module'
import { RadioService } from './services/radio.service'
import { RadioProcessor } from './processors/radio.processor'
import { RadioStreamService } from './services/radio-stream.service'
import { BullBoardModule } from '@bull-board/nestjs'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { RadioGateway } from './gateways/radio.gateway'
import { RadioTrackService } from './services/radio-track.service'
import { RadioTrackBuilderService } from './services/radio-track-builder.service'
import { MusicRepository } from './repositories/music.repository'
import { RadioTrackController } from './controllers/radio-track.controller'

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
  ],
  controllers: [RadioController, RadioTrackController],
  providers: [
    RadioService,
    RadioStreamService,
    RadioProcessor,
    RadioGateway,
    RadioTrackService,
    RadioTrackBuilderService,
    MusicRepository,
  ],
  exports: [RadioService],
})
export class RadioModule {}
