import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcess, spawn } from 'node:child_process';
import * as net from 'node:net';
import * as fs from 'node:fs';
import { TrackMeta } from '../../playlist/playlist.types';

@Injectable()
export class RadioStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadioStreamService.name);

  private hlsProcess: ChildProcess | null = null;
  private isRunning = false;
  private currentTrack: TrackMeta | null = null;

  private readonly icecastHost: string;
  private readonly icecastPort: number;
  private readonly icecastMount: string;
  private readonly icecastUser: string;
  private readonly icecastPass: string;

  private readonly liquidsoapHost: string;
  private readonly liquidsoapPort: number;

  private readonly hlsOutputDir: string;

  constructor(private readonly configService: ConfigService) {
    this.icecastHost = this.configService.get('icecast.host', 'localhost');
    this.icecastPort = this.configService.get('icecast.port', 8000);
    this.icecastMount = this.configService.get('icecast.mount', '/live.mp3');
    this.icecastUser = this.configService.get('icecast.user', 'source');
    this.icecastPass = this.configService.get('icecast.pass', 'hackme');

    this.liquidsoapHost = this.configService.get(
      'liquidsoap.host',
      '127.0.0.1',
    );
    this.liquidsoapPort = this.configService.get('liquidsoap.port', 1234);

    this.hlsOutputDir = this.configService.get('hls.outputDir', '/tmp/hls');
  }

  onModuleInit() {
    fs.mkdirSync(this.hlsOutputDir, { recursive: true });
    this.logger.log('RadioStreamService initialized');
  }

  onModuleDestroy() {
    this.stopAll();
  }

  get nowPlaying(): TrackMeta | null {
    return this.currentTrack;
  }

  // ─── Liquidsoap telnet ────────────────────────────────────────────────────
  private sendLiquidsoapCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(
        { host: this.liquidsoapHost, port: this.liquidsoapPort },
        () => {
          client.write(command + '\n');
        },
      );

      let response = '';
      client.on('data', (data) => {
        response += data.toString();
        if (response.includes('END')) {
          client.end();
        }
      });

      client.on('end', () =>
        resolve(response.replace(/END\r?\n?$/, '').trim()),
      );
      client.on('error', reject);

      client.setTimeout(3000, () => {
        client.destroy();
        reject(new Error('Liquidsoap command timed out'));
      });
    });
  }

  async setNextTrack(track: TrackMeta): Promise<void> {
    this.currentTrack = track;
    try {
      await this.sendLiquidsoapCommand(`request.push ${track.filePath}`);
      this.logger.log(`Liquidsoap queued: "${track.title}"`);
    } catch (err) {
      this.logger.error(`Liquidsoap setNextTrack failed: ${String(err)}`);
    }
  }

  async skip(): Promise<void> {
    this.currentTrack = null;
    try {
      await this.sendLiquidsoapCommand('skip');
      this.logger.log('Liquidsoap: skipped track');
    } catch (err) {
      this.logger.error(`Liquidsoap skip failed: ${String(err)}`);
    }
  }

  async reloadPlaylist(): Promise<void> {
    try {
      await this.sendLiquidsoapCommand('playlist.reload');
      this.logger.log('Liquidsoap: playlist reloaded');
    } catch (err) {
      this.logger.error(`Liquidsoap reload failed: ${String(err)}`);
    }
  }

  // Returns how many seconds remain in the current track.
  // Requires server.register in radio.liq exposing "track.remaining".
  async getRemaining(): Promise<number> {
    try {
      const res = await this.sendLiquidsoapCommand('track.remaining');
      const seconds = parseFloat(res);
      this.logger.debug(`Liquidsoap remaining: ${seconds}s`);
      return isNaN(seconds) || seconds < 0 ? 30 : seconds;
    } catch {
      this.logger.warn('getRemaining failed — defaulting to 30s');
      return 30;
    }
  }

  // ─── Icecast readiness ────────────────────────────────────────────────────
  private async waitForIcecast(retries = 20, intervalMs = 3000): Promise<void> {
    const url = `http://${this.icecastHost}:${this.icecastPort}${this.icecastMount}`;

    for (let i = 0; i < retries; i++) {
      try {
        // We only care that Icecast is accepting connections, not that the
        // mount is live yet — a 404 still means Icecast is up.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        // 200 = stream live, 404 = mount not yet registered (Liquidsoap
        // may still be starting), anything else = Icecast is at least up.
        if (res.status !== 0) {
          this.logger.log(`Icecast ready (HTTP ${res.status})`);
          return;
        }
      } catch {
        // connection refused or aborted — not ready
      }

      this.logger.log(`Waiting for Icecast at ${url}... (${i + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`Icecast never became ready at ${url}`);
  }

  // ─── HLS packager ────────────────────────────────────────────────────────
  startHlsPackager(): void {
    if (this.hlsProcess) return;
    this.isRunning = true;

    this.waitForIcecast()
      .then(() => this.spawnFfmpeg())
      .catch((err) =>
        this.logger.error(`HLS packager aborted: ${err.message}`),
      );
  }

  private spawnFfmpeg(): void {
    if (!this.isRunning) return; // stopAll() was called while waiting

    const sourceUrl =
      `http://${this.icecastUser}:${this.icecastPass}` +
      `@${this.icecastHost}:${this.icecastPort}${this.icecastMount}`;

    const segmentPath = `${this.hlsOutputDir}/segment_%05d.ts`;
    const playlistPath = `${this.hlsOutputDir}/stream.m3u8`;

    const args = [
      '-re',
      '-i',
      sourceUrl,

      // Transcode to AAC 128k
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
      '-ar',
      '44100',

      // HLS muxer
      '-f',
      'hls',
      '-hls_time',
      '6',
      '-hls_list_size',
      '10',
      '-hls_flags',
      'delete_segments+append_list',
      '-hls_segment_type',
      'mpegts',
      '-hls_segment_filename',
      segmentPath,
      playlistPath,
    ];

    this.hlsProcess = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.hlsProcess.stderr?.on('data', (buf: Buffer) => {
      const msg = buf.toString();
      // ffmpeg writes normal progress to stderr; only surface real errors
      if (msg.includes('Error') || msg.includes('error')) {
        this.logger.error(`[hls-packager] ${msg.trim()}`);
      }
    });

    this.hlsProcess.on('close', (code) => {
      this.hlsProcess = null;
      this.logger.warn(`[hls-packager] exited with code ${code}`);
      if (this.isRunning) {
        this.logger.log('[hls-packager] restarting in 3s...');
        setTimeout(() => this.spawnFfmpeg(), 3000);
      }
    });

    this.hlsProcess.on('error', (err) => {
      this.logger.error(`[hls-packager] spawn error: ${err.message}`);
      if (err.message.includes('ENOENT')) {
        this.logger.error('ffmpeg not found — install it: brew install ffmpeg');
        this.isRunning = false; // don't retry if binary is missing
      }
    });

    this.logger.log(`HLS packager started → ${playlistPath}`);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  stopAll(): void {
    this.isRunning = false;
    this.hlsProcess?.kill('SIGTERM');
    this.hlsProcess = null;
    this.currentTrack = null;
  }
}
