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
    // drain() only removes waiting + delayed jobs — never touches an
    // already-dequeued active job, so no "Missing key" race condition.
    await this.queue.drain(true);
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
    this.streamService.startHlsPackager();
    await this.enqueueNext();
    this.logger.log('Radio started');
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.streamService.stopAll();
    await this.queue.drain(true);
    this.logger.log('Radio stopped');
  }

  async skip(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Cannot skip — radio is not running');
      return;
    }
    await this.streamService.skip();
    await this.enqueueNext();
    this.logger.log('Skipped to next track');
  }

  async queueSize(): Promise<number> {
    return this.queue.count();
  }

  async enqueueNext(): Promise<void> {
    const jobOptions: JobsOptions = {
      attempts: 3,
      backoff: { type: 'fixed', delay: 2000 },
      delay: 100,
      removeOnComplete: true, // delete key immediately — prevents "Missing key" on restart
      removeOnFail: 10, // keep last 10 failures for debugging
    };
    await this.queue.add(PLAY_NEXT_JOB, {}, jobOptions);
  }
}
