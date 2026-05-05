import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE } from '../../queue/queue.constant';
import { RadioStreamService } from './radio-stream.service';
import { PLAY_NEXT_JOB } from '../processors/radio.processor';
import { PlaylistService } from '../../playlist/services/playlist.service';

@Injectable()
export class RadioService implements OnModuleInit {
  private readonly logger = new Logger(RadioService.name);
  private isRunning = false;

  constructor(
    @InjectQueue(QUEUE.RADIO_QUEUE) private readonly queue: Queue,
    private readonly streamService: RadioStreamService,
    private readonly playlistService: PlaylistService,
  ) {}

  async onModuleInit() {
    await this.queue.obliterate({ force: true }).catch(() => null);

    // event-driven scheduling
    this.streamService.on('track-ended', async () => {
      await this.enqueueNext();
    });
  }

  get status() {
    return this.isRunning ? 'playing' : 'stopped';
  }

  get nowPlaying() {
    return this.streamService.nowPlaying ?? null;
  }

  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    await this.enqueueNext();

    this.logger.log('Radio started');
  }

  async stop() {
    this.isRunning = false;
    this.streamService.stopCurrent();
    await this.queue.drain();

    this.logger.log('Radio stopped');
  }

  async skip() {
    if (!this.isRunning) return;

    this.streamService.stopCurrent();
  }

  async enqueueNext() {
    if (!this.isRunning) return;

    const track = await this.playlistService.getNext();

    if (!track) {
      this.logger.warn('Playlist empty');
      return;
    }

    await this.queue.add(
      PLAY_NEXT_JOB,
      { track },
      {
        attempts: 3,
        backoff: { type: 'fixed', delay: 2000 },
        delay: 0,
      },
    );
  }
}
