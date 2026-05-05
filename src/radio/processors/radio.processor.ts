import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE } from '../../queue/queue.constant';
import { KafkaService } from '../../kafka/kafka.service';
import { KAFKA_EVENT, KAFKA_TOPIC } from '../../kafka/kafka.constant';
import { RadioStreamService } from '../services/radio-stream.service';

export const PLAY_NEXT_JOB = 'play-next';

@Processor(QUEUE.RADIO_QUEUE)
export class RadioProcessor extends WorkerHost {
  private readonly logger = new Logger(RadioProcessor.name);

  constructor(
    private readonly kafka: KafkaService,
    private readonly streamService: RadioStreamService,
    @InjectQueue(QUEUE.RADIO_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<{ played: boolean, trackId?: string | null }> {
    if (job.name !== PLAY_NEXT_JOB) return { played: false };

    const track = job.data.track;

    if (!track) {
      this.logger.warn('No track in job data');
      return { played: false };
    }

    this.logger.log(`▶ Now playing: ${track.title}`);

    await this.kafka.send(KAFKA_TOPIC.RADIO_EVENTS, {
      event: KAFKA_EVENT.TRACK_STARTED,
      trackId: track.id,
      ts: Date.now(),
    });

    this.streamService.streamTrack(track);

    await this.kafka.send(KAFKA_TOPIC.RADIO_EVENTS, {
      event: KAFKA_EVENT.TRACK_ENDED,
      trackId: track.id,
      ts: Date.now(),
    });

    return {
      played: true,
      trackId: track.id,
    };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}
