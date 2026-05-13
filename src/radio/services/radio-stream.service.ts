import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  spawn,
  ChildProcess,
  execSync,
  execFileSync,
} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { TrackMeta } from '../../playlist/playlist.types';
import { WS_EVENTS } from '../../common/constants/provider.constant';
import { PlaylistService } from '../../playlist/services/playlist.service';

@Injectable()
export class RadioStreamService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RadioStreamService.name);

  // PIPE + FFMPEG
  private readonly pipePath: string;
  private readonly ffmpegPath: string;
  // AUDIO
  private readonly audioBitrate: string;
  private readonly sampleRate: number;

  private pipeStream: fs.WriteStream | null = null;

  private currentTrack: TrackMeta | null = null;
  private activeProcess: ChildProcess | null = null;

  // ICECAST
  private readonly icecastUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly playlistService: PlaylistService,
  ) {
    super();

    // PIPE + FFMPEG
    this.pipePath = this.config.get<string>('radio.pipePath') as string;
    this.ffmpegPath = this.config.get<string>('radio.ffmpegPath') as string;

    // AUDIO CONFIG
    this.audioBitrate = this.config.get<string>('radio.audioBitrate') as string;
    this.sampleRate = this.config.get<number>('radio.sampleRate') as number;

    // ICECAST
    this.icecastUrl = this.config.get<string>('icecast.sourceUrl') as string;
  }

  /**
   * Runs when NestJS module starts
   * Initializes pipe + FFmpeg + write stream
   */
  onModuleInit() {
    this.logger.log('Radio stream service initialized.');

    this.ensurePipe();
    this.startFFmpeg();

    // Creates writable stream to FIFO pipe
    this.pipeStream = fs.createWriteStream(this.pipePath, {
      flags: 'a',
    });

    this.logger.log('Stream pipeline ready');
  }

  // Runs when NestJS shuts down
  // Cleans up FFmpeg process
  onModuleDestroy() {
    this.stopCurrent();
  }

  // Accessors
  // Returns currently playing track
  get nowPlaying() {
    return this.currentTrack;
  }

  // Stops FFmpeg and resets state
  stopCurrent() {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
    }
    this.currentTrack = null;
  }

  // Private Helpers
  /**
   * Creates FIFO pipe if it doesn't exist
   * Acts as communication bridge between Node.js and FFmpeg
   */
  private ensurePipe() {
    // ensure the tmp/ directory exists before touching the pipe
    fs.mkdirSync(path.dirname(this.pipePath), { recursive: true });

    if (fs.existsSync(this.pipePath)) {
      // Remove stale pipe from a previous run
      fs.unlinkSync(this.pipePath);
    }

    this.logger.log('Creating FIFO pipe');

    // execSync instead of spawn — blocks until mkfifo completes,
    // so the FIFO is guaranteed to exist before createWriteStream is called
    execSync(`mkfifo ${this.pipePath}`);
  }

  /**
   * Starts FFmpeg once and keeps it running for entire system lifecycle
   * Reads audio from FIFO pipe and streams it to Icecast
   */
  private startFFmpeg() {
    // Spawn a ffmpeg command
    this.activeProcess = spawn(this.ffmpegPath, [
      '-re', // Read input at native rate (prevents ffmpeg from pushing data too fast)
      '-i', // Input source (your pipe / stream source)
      this.pipePath, // Disable video (audio-only stream)
      // Set audio codec to MP3 (widely supported for Icecast)
      '-vn',
      '-acodec',
      'libmp3lame',
      // Audio bitrate (128 kbps = decent quality vs bandwidth balance)
      '-ab',
      this.audioBitrate,
      // Audio sample rate (44.1 kHz = standard for music streaming)
      '-ar',
      this.sampleRate.toString(),
      // Audio filter:
      // - aresample=async=1 → fixes timing drift by resampling dynamically
      // - first_pts=0 → resets timestamps to start clean (prevents gaps at start)
      '-af',
      'aresample=async=1:first_pts=0',
      // Output format (MP3 container for Icecast)
      '-f',
      'mp3',
      // Destination (Icecast server URL with mount + auth)
      this.icecastUrl,
    ]);

    this.logger.log('FFmpeg streaming started.');

    // Debug logs from FFmpeg
    // stdout → raw media bytes only, and only if output is `-`  ✗ (never in your case)
    this.activeProcess.stdout?.on('data', (data) => {
      this.logger.debug('stdout', data.toString());
    });
    // stderr → all logs, info, warnings, errors, progress
    this.activeProcess.stderr?.on('data', (data) => {
      const msg = data.toString();

      if (
        msg.includes('Error') ||
        msg.includes('error') ||
        msg.includes('Invalid')
      ) {
        this.logger.error(msg);
      } else {
        this.logger.debug('ffmpeg', msg);
      }
    });

    // Handles FFmpeg crash/exit
    this.activeProcess.on('close', () => {
      this.logger.warn('FFmpeg stream closed.');
      this.activeProcess = null;
    });
  }

  /**
   * Reads the duration of an audio file using ffprobe.
   * Returns duration in milliseconds, or null if it fails.
   *
   * ffprobe -v error -show_entries format=duration -of csv=p=0 <file>
   */
  private getTrackDurationMs(filePath: string): number | null {
    try {
      // ffprobe is bundled with ffmpeg — assume same directory
      const ffprobePath = this.ffmpegPath.replace(/ffmpeg$/, 'ffprobe');

      const output = execFileSync(
        ffprobePath,
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'csv=p=0',
          filePath,
        ],
        { timeout: 5_000 },
      )
        .toString()
        .trim();

      const seconds = parseFloat(output);
      if (Number.isNaN(seconds)) return null;

      return Math.round(seconds * 1000);
    } catch (err) {
      this.logger.warn(`ffprobe failed for ${filePath}: ${String(err)}`);
      return null;
    }
  }

  // Main streaming logic
  /**
   * Pipes a single track into the FIFO → FFmpeg → Icecast pipeline.
   *
   * Key behaviour:
   * - Records track start + duration to Redis so any pod (or the refill logic)
   *   knows how much time is left in the playlist.
   * - Emits TRACK_START / TRACK_ENDED events.
   * - Does NOT restart FFmpeg between tracks — the pipe stays open.
   */
  streamTrack(track: TrackMeta): void {
    // this.stopCurrent();

    const filePath = path.resolve(track.filePath);

    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`);
      this.emit(WS_EVENTS.TRACK_ENDED, track);
      return;
    }

    this.currentTrack = track;
    this.logger.log(`▶ Streaming: ${track.title}`);

    // Record timing to Redis
    const durationMs = this.getTrackDurationMs(filePath) ?? 0;
    void this.playlistService.recordTrackStart(track.id, durationMs);

    // Emit start event (gateway picks this up)
    this.emit(WS_EVENTS.TRACK_START, track);

    // Stream into PIPE (no ffmpeg restart)
    const stream = fs.createReadStream(filePath, {
      /**
       * Size of each chunk read from the file (in bytes)
       * 64 * 1024 = 64KB per chunk
       * Controls how much data is buffered before it's pushed downstream
       * Smaller → lower memory usage, more frequent reads
       * Larger → fewer reads, better throughput but higher memory usage
       * 64KB is a good balanced default for streaming (especially audio/video pipelines)
       */
      highWaterMark: 64 * 1024,
    });

    stream.on('error', (err) => {
      // File/stream read failed
      this.logger.error(`Stream error: ${err.message}`);
    });

    stream.on('end', () => {
      this.logger.log(`✓ Finished: ${track.title}`);

      // Notify listeners that track ended
      this.emit(WS_EVENTS.TRACK_ENDED, track);

      // Reset current track state
      this.currentTrack = null;
    });

    // Pipe audio into FFmpeg without closing stream (keeps radio running)
    stream.pipe(this.pipeStream!, { end: false });
  }
}
