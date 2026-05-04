import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { Logger } from '@nestjs/common';

import { QUEUE } from '../../queue/queue.constant';
import { PlaylistService } from '../../playlist/services/playlist.service';
import { KafkaService } from '../../kafka/kafka.service';
import { KAFKA_EVENT, KAFKA_TOPIC } from '../../kafka/kafka.constant';
import { RadioStreamService } from '../services/radio-stream.service';

export const PLAY_NEXT_JOB = 'play-next';

@Processor(QUEUE.RADIO_QUEUE, {
  // lockDuration: how long the lock lasts
  lockDuration: 5 * 60 * 1000, // 5 minutes
  // lockRenewTime: how often it renews (must be less than lockDuration)
  lockRenewTime: 2 * 60 * 1000, // renew every 2 minutes
})
export class RadioProcessor extends WorkerHost {
  private readonly logger = new Logger(RadioProcessor.name);

  constructor(
    private readonly playlistService: PlaylistService,
    private readonly kafka: KafkaService,
    private readonly streamService: RadioStreamService,

    @InjectQueue(QUEUE.RADIO_QUEUE)
    private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<{ played: boolean }> {
    if (job.name !== PLAY_NEXT_JOB) return { played: false };

    const track = await this.playlistService.getNext();

    if (!track) {
      this.logger.warn('No track returned from playlist — queue is empty');
      return { played: false };
    }

    this.logger.log(`▶ Now playing: "${track.title}" by ${track.artist}`);

    await this.kafka.send(KAFKA_TOPIC.RADIO_EVENTS, {
      event: KAFKA_EVENT.TRACK_STARTED,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      ts: Date.now(),
    });

    await this.streamService.streamTrack(track);

    await this.kafka.send(KAFKA_TOPIC.RADIO_EVENTS, {
      event: KAFKA_EVENT.TRACK_ENDED,
      trackId: track.id,
      ts: Date.now(),
    });

    this.logger.log(`✓ Finished: "${track.title}"`);
    // signals onCompleted to enqueue next track
    return { played: true };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    if (job.name !== PLAY_NEXT_JOB) return;

    // Stop if the last job found nothing to play
    if (!job.returnvalue?.played) {
      this.logger.warn('No track in playlist — will not re-enqueue');
      return;
    }

    const waiting = await this.queue.count();

    if (waiting === 0) {
      await this.queue.add(
        PLAY_NEXT_JOB,
        {},
        {
          attempts: 3,
          backoff: { type: 'fixed', delay: 2000 },
          delay: 100,
        },
      );

      this.logger.log('▶ Enqueued next track');
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
  }
}
