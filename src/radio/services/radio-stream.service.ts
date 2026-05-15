import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { spawn, ChildProcess, execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { EventEmitter } from 'node:events'
import { TrackMeta } from '../radio.types'
import { WS_EVENTS } from '../../common/constants/provider.constant'

@Injectable()
export class RadioStreamService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RadioStreamService.name)

  // PIPE + FFMPEG
  private readonly pipePath: string
  private readonly ffmpegPath: string
  // AUDIO
  private readonly audioBitrate: string
  private readonly sampleRate: number

  private pipeStream: fs.WriteStream | null = null

  private currentTrack: TrackMeta | null = null
  private activeProcess: ChildProcess | null = null

  // track the read stream so we can unpipe it
  private activeReadStream: fs.ReadStream | null = null

  // ICECAST
  private readonly icecastUrl: string

  constructor(private readonly config: ConfigService) {
    super()

    // PIPE + FFMPEG
    this.pipePath = this.config.get<string>('radio.pipePath') as string
    this.ffmpegPath = this.config.get<string>('radio.ffmpegPath') as string

    // AUDIO CONFIG
    this.audioBitrate = this.config.get<string>('radio.audioBitrate') as string
    this.sampleRate = this.config.get<number>('radio.sampleRate') as number

    // ICECAST
    this.icecastUrl = this.config.get<string>('icecast.sourceUrl') as string
  }

  /**
   * Creates FIFO pipe if it doesn't exist
   * Acts as communication bridge between Node.js and FFmpeg
   */
  private ensurePipe() {
    // ensure the tmp/ directory exists before touching the pipe
    fs.mkdirSync(path.dirname(this.pipePath), { recursive: true })

    if (fs.existsSync(this.pipePath)) {
      // Remove stale pipe from a previous run
      fs.unlinkSync(this.pipePath)
    }

    this.logger.log('Creating FIFO pipe')

    // execSync instead of spawn — blocks until mkfifo completes,
    // so the FIFO is guaranteed to exist before createWriteStream is called
    execSync(`mkfifo ${this.pipePath}`)
  }

  /**
   * Runs when NestJS module starts
   * Only initializes the service — stream starts when radio.service calls startStream()
   */
  onModuleInit() {
    this.logger.log('Radio stream service initialized.')
  }

  /**
   * Starts FFmpeg once and keeps it running for entire system lifecycle
   * Reads audio from FIFO pipe and streams it to Icecast
   */
  private startFFmpeg() {
    this.activeProcess = spawn(this.ffmpegPath, [
      '-re', // Read input at native rate (prevents ffmpeg from pushing data too fast)
      '-i', // Input source (your pipe / stream source)
      this.pipePath,
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
    ])

    this.logger.log('FFmpeg streaming started.')

    // stdout → raw media bytes only, and only if output is `-` ✗ (never in your case)
    this.activeProcess.stdout?.on('data', (data) => {
      this.logger.debug('stdout', data.toString())
    })
    // stderr → all logs, info, warnings, errors, progress
    this.activeProcess.stderr?.on('data', (data) => {
      const msg = data.toString()

      if (
        msg.includes('Error') ||
        msg.includes('error') ||
        msg.includes('Invalid')
      ) {
        this.logger.error(msg)
      } else {
        this.logger.debug('ffmpeg', msg)
      }
    })

    // Handles FFmpeg crash/exit
    this.activeProcess.on('close', () => {
      this.logger.warn('FFmpeg stream closed.')
      this.activeProcess = null

      // when stopStream() already destroyed it before close fires
      if (this.pipeStream && !this.pipeStream.destroyed) {
        this.pipeStream.destroy()
        this.pipeStream = null
      }
    })
  }

  /**
   * Called by radio.service on start()
   * Creates fresh pipe + FFmpeg + write stream
   */
  startStream() {
    this.ensurePipe()

    // create pipeStream FIRST so FFmpeg has a writer when it opens the pipe
    this.pipeStream = fs.createWriteStream(this.pipePath, { flags: 'a' })

    // ignore write-after-destroy and EPIPE — both happen on clean stop
    // when FFmpeg flushes its last bytes as it exits after SIGTERM
    this.pipeStream.on('error', (err: NodeJS.ErrnoException) => {
      if (
        err.code === 'EPIPE' ||
        err.message.includes('after a stream was destroyed')
      )
        return
      this.logger.error(`Pipe stream error: ${err.message}`)
    })

    // start FFmpeg after pipeStream is ready
    this.startFFmpeg()

    this.logger.log('Stream pipeline ready')
  }

  /**
   * Called by radio.service on stop()
   * Kills FFmpeg and destroys pipe — full clean disconnect from Icecast
   */
  stopStream() {
    // unpipe active read stream first before destroying pipe
    if (this.activeReadStream) {
      this.activeReadStream.unpipe()
      this.activeReadStream.destroy()
      this.activeReadStream = null
    }

    this.currentTrack = null

    if (this.activeProcess) {
      // destroy pipe only after ffmpeg fully exits
      // prevents "write after destroy" — ffmpeg flushes last bytes on SIGTERM
      this.activeProcess.once('close', () => {
        this.pipeStream?.destroy()
        this.pipeStream = null
      })
      this.activeProcess.kill('SIGTERM')
      this.activeProcess = null
    } else {
      // no ffmpeg running, destroy pipe immediately
      this.pipeStream?.destroy()
      this.pipeStream = null
    }
  }

  // Runs when NestJS shuts down
  // Cleans up FFmpeg process
  onModuleDestroy() {
    this.stopStream()
  }

  // Returns currently playing track
  get nowPlaying() {
    return this.currentTrack
  }

  // Stops current track only — FFmpeg keeps running
  stopCurrent() {
    if (this.activeReadStream) {
      this.activeReadStream.unpipe()
      this.activeReadStream.destroy()
      this.activeReadStream = null
    }

    // nothing to kill here since we pipe fs.ReadStream directly
    // just reset state so next track can start clean
    this.currentTrack = null
  }

  /**
   * Main function: streams a single track into live radio pipeline
   * File → ReadStream → FIFO pipe → FFmpeg → Icecast
   */
  streamTrack(track: TrackMeta): void {
    const filePath = path.resolve(track.filePath)

    if (!fs.existsSync(filePath)) {
      this.logger.error(`File not found: ${filePath}`)
      return
    }

    this.currentTrack = track

    this.logger.log(`▶ Streaming: ${track.title}`)

    // START EVENT
    this.emit(WS_EVENTS.TRACK_START, track)

    // Stream into PIPE (no ffmpeg restart)
    this.activeReadStream = fs.createReadStream(filePath, {
      /**
       * Size of each chunk read from the file (in bytes)
       * 64 * 1024 = 64KB per chunk
       * Controls how much data is buffered before it's pushed downstream
       * Smaller → lower memory usage, more frequent reads
       * Larger → fewer reads, better throughput but higher memory usage
       * 64KB is a good balanced default for streaming (especially audio/video pipelines)
       */
      highWaterMark: 64 * 1024,
    })

    this.activeReadStream.on('error', (err) => {
      // File/stream read failed
      this.logger.error(`Stream error: ${err.message}`)
    })

    this.activeReadStream.on('end', () => {
      this.logger.log(`✓ Finished: ${track.title}`)

      // Notify listeners that track ended
      this.emit(WS_EVENTS.TRACK_ENDED, track)

      this.activeReadStream = null

      // Reset current track state
      this.currentTrack = null
    })

    // Pipe audio into FFmpeg without closing stream (keeps radio running)
    this.activeReadStream.pipe(this.pipeStream!, { end: false })
  }
}
