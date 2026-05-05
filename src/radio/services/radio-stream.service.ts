import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { TrackMeta } from '../../playlist/playlist.types';

@Injectable()
export class RadioStreamService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RadioStreamService.name);

  private currentTrack: TrackMeta | null = null;
  private activeProcess: ChildProcess | null = null;

  private readonly icecastHost: string;
  private readonly icecastPort: number;
  private readonly icecastMount: string;
  private readonly icecastUser: string;
  private readonly icecastPass: string;

  constructor(private readonly config: ConfigService) {
    super();

    this.icecastHost = this.config.get('icecast.host', '127.0.0.1');
    this.icecastPort = this.config.get('icecast.port', 8000);
    this.icecastMount = this.config.get('icecast.mount', '/live.mp3');
    this.icecastUser = this.config.get('icecast.user', 'source');
    this.icecastPass = this.config.get('icecast.pass', 'hackme');
  }

  onModuleInit() {
    this.logger.log('Stream service ready');
  }

  onModuleDestroy() {
    this.stopCurrent();
  }

  get nowPlaying() {
    return this.currentTrack;
  }

  stopCurrent() {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
    }
    this.currentTrack = null;
  }

  streamTrack(track: TrackMeta): void {
    this.stopCurrent();

    const filePath = path.resolve(track.filePath);

    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`);
      return;
    }

    this.currentTrack = track;

    const icecastUrl =
      `icecast://${this.icecastUser}:${this.icecastPass}` +
      `@${this.icecastHost}:${this.icecastPort}${this.icecastMount}`;

    const ffmpeg = spawn('ffmpeg', [
      '-re',
      '-i',
      filePath,
      '-vn',
      '-acodec',
      'libmp3lame',
      '-ab',
      '128k',
      '-ar',
      '44100',
      '-f',
      'mp3',
      icecastUrl,
    ]);

    this.activeProcess = ffmpeg;

    this.logger.log(`▶ Streaming: ${track.title}`);

    ffmpeg.on('close', () => {
      this.logger.log(`✓ Finished: ${track.title}`);
      this.currentTrack = null;
      this.activeProcess = null;
      // Emit Event
      this.emit('track-ended', track);
    });

    ffmpeg.on('error', (err) => {
      this.logger.error(`FFmpeg error: ${err.message}`);
    });
  }
}
