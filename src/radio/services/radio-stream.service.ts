import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import EventEmitter from 'node:events';
import { TrackMeta } from '../../playlist/playlist.types';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RadioChunkEvent {
  trackId: string;
  chunk: Buffer;
}

@Injectable()
export class RadioStreamService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RadioStreamService.name);
  private currentTrack: TrackMeta | null = null;
  private activeStream: fs.ReadStream | null = null;

  // Chunk size: ~16 KB per emit (~audio "packet")
  private readonly CHUNK_SIZE = 16 * 1024;

  // Simulate real-time by throttling chunk delivery (ms between chunks)
  // For MP3 at 128kbps: 16KB ≈ 1 second of audio
  private readonly CHUNK_INTERVAL_MS = 500;

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
    if (this.activeStream) {
      this.activeStream.destroy();
      this.activeStream = null;
    }
    this.currentTrack = null;
  }

  /**
   * Streams a track file chunk-by-chunk with throttling.
   * Resolves when the file is fully streamed or destroyed.
   */
  streamTrack(track: TrackMeta): Promise<void> {
    return new Promise((resolve, reject) => {
      // Stop Existing stream
      this.stopCurrent();

      const filePath = path.resolve(track.filePath);

      if (!fs.existsSync(filePath)) {
        this.logger.error(`File not found: ${filePath}`);
        return reject(new Error(`File not found: ${filePath}`));
      }

      this.currentTrack = track;

      const readStream = fs.createReadStream(filePath, {
        highWaterMark: this.CHUNK_SIZE,
      });

      this.activeStream = readStream;

      this.logger.log(`Streaming file: ${filePath}`);

      // Buffer chunks and emit with throttle to simulate real-time playback
      const chunks: Buffer[] = [];

      readStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      readStream.on('end', async () => {
        // Emit chunks with delay to simulate live radio timing
        for (const chunk of chunks) {
          if (!this.activeStream) break; // Stopped externally

          this.emit('chunk', {
            trackId: track.id,
            chunk,
          } satisfies RadioChunkEvent);

          await this.delay(this.CHUNK_INTERVAL_MS);
        }

        this.logger.log(`Stream complete: ${track.title}`);
        this.currentTrack = null;
        this.activeStream = null;
        resolve();
      });

      readStream.on('error', (err) => {
        this.logger.error(`Stream error: ${err.message}`);
        this.currentTrack = null;
        this.activeStream = null;
        reject(err);
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
