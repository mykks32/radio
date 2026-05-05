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

    this.logger.log(`▶ Queuing: "${track.title}" by ${track.artist}`);

    // CHANGED: replaced streamTrack() (which no longer exists) with
    // setNextTrack(). Liquidsoap owns playback; we just tell it what's next.
    // The job completes immediately — we no longer block for track duration.
    await this.streamService.setNextTrack(track);

    await this.kafka.send(KAFKA_TOPIC.RADIO_EVENTS, {
      event: KAFKA_EVENT.TRACK_STARTED,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      ts: Date.now(),
    });

    this.logger.log(`✓ Handed off to Liquidsoap: "${track.title}"`);
    return { played: true };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    if (job.name !== PLAY_NEXT_JOB) return;
    if (!job.returnvalue?.played) return;

    const waiting = await this.queue.count();
    if (waiting > 0) return;

    const remainingSeconds = await this.streamService.getRemaining();
    // Never schedule sooner than 5s from now — protects against bad values
    const delayMs = Math.max((remainingSeconds - 2) * 1000, 5_000);

    await this.queue.add(
      PLAY_NEXT_JOB,
      {},
      {
        attempts: 3,
        backoff: { type: 'fixed', delay: 2000 },
        delay: delayMs,
      },
    );

    this.logger.log(`▶ Next track enqueued in ${Math.round(delayMs / 1000)}s`);
  }
  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
  }
}
