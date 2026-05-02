import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlaylistService } from '../playlist/services/playlist.service';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RadioService implements OnModuleDestroy {
  private req: http.ClientRequest | null = null;
  private currentFile: fs.ReadStream | null = null;
  private isRunning = false;
  private readonly logger = new Logger(RadioService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly playlistService: PlaylistService,
  ) {}

  async startStream(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Stream already running');
      return;
    }

    const host = this.configService.get<string>('icecast.host', '127.0.0.1');
    const port = this.configService.get<number>('icecast.port', 8000);
    const mount = this.configService.get<string>('icecast.mount', '/live.mp3');
    const user = this.configService.get<string>('icecast.user', 'source');
    const pass = this.configService.get<string>('icecast.pass', 'hackme');

    this.req = http.request(
      {
        hostname: host,
        port,
        path: mount,
        method: 'SOURCE',
        headers: {
          'Content-Type': 'audio/mpeg',
          Authorization:
            'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
          'Ice-Name': 'NestJS Radio',
          'Ice-Description': 'Simple NestJS Icecast Stream',
          'Ice-Public': '1',
        },
      },
      (res) => {
        this.logger.log(`Connected to Icecast: ${res.statusCode}`);
      },
    );

    this.req.on('error', (err) => {
      this.logger.error(`Stream error: ${err.message}`);
      this.isRunning = false;
    });

    this.isRunning = true;
    this.logger.log('📻 Radio stream started');

    // Kick off the play loop — does NOT block
    this.playLoop();
  }

  private async playLoop(): Promise<void> {
    while (this.isRunning && this.req) {
      const track = await this.playlistService.getNext();

      if (!track) {
        this.logger.warn('Playlist empty — retrying in 3s');
        await this.delay(3000);
        continue;
      }

      const filePath = path.resolve(track.filePath);

      if (!fs.existsSync(filePath)) {
        this.logger.error(`File not found, skipping: ${filePath}`);
        continue;
      }

      this.logger.log(`▶ Now playing: "${track.title}" by ${track.artist}`);

      // Wait until this track finishes before moving to the next
      await this.pipeTrack(filePath);

      this.logger.log(`✓ Finished: "${track.title}"`);
    }
  }

  private pipeTrack(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.req) return resolve();

      const file = fs.createReadStream(filePath);
      this.currentFile = file;

      // Pipe into Icecast without closing the connection when file ends
      file.pipe(this.req, { end: false });

      file.on('end', () => {
        this.currentFile = null;
        resolve();
      });

      file.on('error', (err) => {
        this.logger.error(`File error: ${err.message}`);
        this.currentFile = null;
        reject(err);
      });
    });
  }

  stopStream(): void {
    this.isRunning = false;

    if (this.currentFile) {
      this.currentFile.destroy();
      this.currentFile = null;
    }

    if (this.req) {
      this.req.destroy();
      this.req = null;
    }

    this.logger.log('📻 Radio stream stopped');
  }

  skip(): void {
    if (this.currentFile) {
      // Destroying the stream triggers 'end' → playLoop moves to next track
      this.currentFile.destroy();
      this.currentFile = null;
      this.logger.log('⏭ Skipped track');
    }
  }

  get status(): 'playing' | 'stopped' {
    return this.isRunning ? 'playing' : 'stopped';
  }

  onModuleDestroy() {
    this.stopStream();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
