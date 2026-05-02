import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import { PLAY_NEXT_JOB } from '../processors/radio.processor';
import { RadioStreamService } from './radio-stream.service';
import { TrackMeta } from '../../playlist/playlist.types';
import { QUEUE } from '../../queue/queue.constant';

@Injectable()
export class RadioService implements OnModuleInit {
  private readonly logger = new Logger(RadioService.name);
  private isRunning = false;

  constructor(
    @InjectQueue(QUEUE.RADIO_QUEUE) private readonly queue: Queue,
    private readonly streamService: RadioStreamService,
  ) {}

  async onModuleInit() {
    await this.queue.obliterate({ force: true }).catch(() => null);
    this.logger.log('Radio queue cleaned on startup');
  }

  get nowPlaying(): TrackMeta | null {
    return this.streamService.nowPlaying;
  }

  get status(): 'playing' | 'stopped' {
    return this.isRunning ? 'playing' : 'stopped';
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Radio already running');
      return;
    }

    this.isRunning = true;
    await this.enqueueNext();
    this.logger.log('📻 Radio started');
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.streamService.stopCurrent();
    await this.queue.drain();
    this.logger.log('📻 Radio stopped');
  }

  async skip(): Promise<void> {
    this.streamService.stopCurrent();
    this.logger.log('⏭ Skipped to next track');
  }

  // Public so RadioProcessor can call it from @OnWorkerEvent('completed')
  async enqueueNext(): Promise<void> {
    const jobOptions: JobsOptions = {
      attempts: 3,
      backoff: { type: 'fixed', delay: 2000 },
      delay: 100,
    };

    await this.queue.add(PLAY_NEXT_JOB, {}, jobOptions);
  }
}
