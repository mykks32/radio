import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUE } from '../../queue/queue.constant';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PlaylistService } from '../../playlist/services/playlist.service';
import { KafkaService } from '../../kafka/kafka.service';
import { KAFKA_EVENT, KAFKA_TOPIC } from '../../kafka/kafka.constant';
import { RadioService } from '../services/radio.service';
import { RadioStreamService } from '../services/radio-stream.service';

export const PLAY_NEXT_JOB = 'play-next';

@Processor(QUEUE.RADIO_QUEUE)
export class RadioProcessor extends WorkerHost {
  private readonly logger = new Logger(RadioProcessor.name);

  constructor(
    private readonly playlistService: PlaylistService,
    private readonly kafka: KafkaService,
    private readonly radioService: RadioService,
    private readonly streamService: RadioStreamService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== PLAY_NEXT_JOB) return;

    const track = await this.playlistService.getNext();

    if (!track) {
      this.logger.warn('No track returned from playlist — queue is empty');
      return;
    }

    this.logger.log(`▶ Now playing: "${track.title}" by ${track.artist}`);

    await this.kafka.send(KAFKA_TOPIC.RADIO_EVENTS, {
      event: KAFKA_EVENT.TRACK_STARTED,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      ts: Date.now(),
    });

    // Stream the file — resolves when the track finishes playing naturally
    // OR when it is intentionally stopped/skipped (stopCurrent → SIGTERM →
    // ffmpeg exits with a signal, which RadioStreamService resolves cleanly).
    await this.streamService.streamTrack(track);

    await this.kafka.send(KAFKA_TOPIC.RADIO_EVENTS, {
      event: KAFKA_EVENT.TRACK_ENDED,
      trackId: track.id,
      ts: Date.now(),
    });

    this.logger.log(`✓ Finished: "${track.title}"`);
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    // Only auto-advance when the radio is still running AND the job completed
    // naturally (i.e. not because of a skip). A skip calls radioService.skip()
    // which enqueues the next track itself before killing the process, so
    // streamTrack resolves cleanly and this job still reaches 'completed'.
    // Guard: if a next job is already waiting in the queue, don't double-enqueue.
    if (job.name !== PLAY_NEXT_JOB) return;
    if (this.radioService.status !== 'playing') return;

    const waiting = await this.radioService.queueSize();
    if (waiting === 0) {
      await this.radioService.enqueueNext();
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
  }
}
