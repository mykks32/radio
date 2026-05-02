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

    // Stream the file — resolves when the track finishes playing
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
    if (job.name === PLAY_NEXT_JOB && this.radioService.status === 'playing') {
      await this.radioService.enqueueNext();
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
  }
}
