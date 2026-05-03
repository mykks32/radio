import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import EventEmitter from 'node:events';
import { TrackMeta } from '../../playlist/playlist.types';
import { ChildProcess, spawn } from 'node:child_process';
import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';
import * as fs from 'node:fs';

@Injectable()
export class RadioStreamService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RadioStreamService.name);
  private currentTrack: TrackMeta | null = null;
  private activeProcess: ChildProcess | null = null;

  // Icecast connection config
  private readonly icecastHost: string;
  private readonly icecastPort: number;
  private readonly icecastMount: string;
  private readonly icecastUser: string;
  private readonly icecastPass: string;

  constructor(private readonly configService: ConfigService) {
    super();

    this.icecastHost = this.configService.get<string>(
      'icecast.host',
      '127.0.0.1',
    );
    this.icecastPort = this.configService.get<number>('icecast.port', 8000);
    this.icecastMount = this.configService.get<string>(
      'icecast.mount',
      '/live.mp3',
    );
    this.icecastUser = this.configService.get<string>('icecast.user', 'source');
    this.icecastPass = this.configService.get<string>('icecast.pass', 'hackme');
  }

  onModuleInit() {
    this.logger.log('RadioStreamService initialized');
  }

  onModuleDestroy() {
    this.stopCurrent();
  }

  get nowPlaying(): TrackMeta | null {
    return this.currentTrack;
  }

  stopCurrent(): void {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
    }

    this.currentTrack = null;
  }

  /**
   * Streams a track to Icecast via ffmpeg.
   * ffmpeg reads the file at real-time rate (-re) and pushes to Icecast
   * using the icecast:// protocol output.
   * Resolves when the track finishes or is stopped intentionally.
   */
  streamTrack(track: TrackMeta): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stopCurrent();

      const filePath = path.resolve(track.filePath);

      if (!fs.existsSync(filePath)) {
        this.logger.error(`File not found: ${filePath}`);
        return reject(new Error(`File not found: ${filePath}`));
      }

      this.currentTrack = track;

      // Build Icecast output URL for ffmpeg
      // icecast://<user>:<password>@<host>:<port><mount>
      const icecastUrl = [
        `icecast://${this.icecastUser}:${this.icecastPass}`,
        `@${this.icecastHost}:${this.icecastPort}${this.icecastMount}`,
      ].join('');

      // ffmpeg args:
      // -re              → read input at native frame rate (real-time)
      // -i <file>        → input file
      // -vn              → drop video if any (cover art etc)
      // -acodec libmp3lame → re-encode to MP3 (or copy if already MP3)
      // -ab 128k         → bitrate
      // -f mp3           → output format
      // ice_*            → Icecast metadata headers
      const ffmpegArgs = [
        '-re',
        '-i', filePath,
        '-vn',
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-ar', '44100',
        '-f', 'mp3',
        '-ice_name', track.title,
        '-ice_description', track.artist,
        '-content_type', 'audio/mpeg',
        icecastUrl,
      ];

      this.logger.log(
        `▶ Piping to Icecast: "${track.title}" by ${track.artist}`,
      );

      const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcess = ffmpeg;

      ffmpeg.stderr.on('data', (data: Buffer) => {
        // ffmpeg logs progress to stderr — only surface actual errors
        const msg = data.toString();
        if (msg.includes('Error') || msg.includes('error')) {
          this.logger.error(`ffmpeg: ${msg.trim()}`);
        }
      });

      ffmpeg.on(
        'close',
        (code: number | null, signal: NodeJS.Signals | null) => {
          this.activeProcess = null;
          this.currentTrack = null;

          // On Linux, SIGTERM does not produce exit code 255 — it produces a
          // null code with signal === 'SIGTERM'. Checking the signal is the
          // correct cross-platform way to detect an intentional kill.
          const killedIntentionally = signal !== null;

          if (code === 0 || killedIntentionally) {
            this.logger.log(`✓ Finished streaming: "${track.title}"`);
            resolve();
          } else {
            const err = new Error(
              `ffmpeg exited unexpectedly with code ${code}`,
            );
            this.logger.error(err.message);
            reject(err);
          }
        },
      );

      ffmpeg.on('error', (err) => {
        this.activeProcess = null;
        this.currentTrack = null;
        this.logger.error(`ffmpeg spawn error: ${err.message}`);
        reject(err);
      });
    });
  }
}
