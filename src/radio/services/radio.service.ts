import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { QUEUE } from '../../queue/queue.constant'
import { RadioStreamService } from './radio-stream.service'
import { PLAY_NEXT_JOB } from '../processors/radio.processor'
import { RadioTrackService } from './radio-track.service'
import { RadioGateway } from '../gateways/radio.gateway'
import { TrackMeta } from '../radio.types'
import { WS_EVENTS } from '../../common/constants/provider.constant'

@Injectable()
export class RadioService implements OnModuleInit {
  private readonly logger = new Logger(RadioService.name)
  private isRunning = false

  constructor(
    @InjectQueue(QUEUE.RADIO_QUEUE) private readonly queue: Queue,
    private readonly streamService: RadioStreamService,
    private readonly radioTrackService: RadioTrackService,
    private readonly gateway: RadioGateway,
  ) {}

  async onModuleInit() {
    await this.queue.obliterate({ force: true }).catch(() => null)

    this.streamService.on(WS_EVENTS.TRACK_START, (track: TrackMeta) => {
      this.gateway.emitTrackStart(track)
    })

    // event-driven scheduling
    this.streamService.on(WS_EVENTS.TRACK_ENDED, (track: TrackMeta) => {
      void (async () => {
        this.gateway.emitTrackEnded(track)

        await this.enqueueNext()
      })().catch((err) => {
        console.error('TRACK_ENDED handler failed:', err)
      })
    })
  }

  get status() {
    return this.isRunning ? 'playing' : 'stopped'
  }

  get nowPlaying() {
    return this.streamService.nowPlaying ?? null
  }

  async start() {
    if (this.isRunning) return

    this.isRunning = true

    // Start fresh pipe + FFmpeg + Icecast connection
    this.streamService.startStream()

    await this.enqueueNext()

    this.logger.log('Radio started')
  }

  async stop() {
    this.isRunning = false

    // Kill FFmpeg + pipe — fully disconnects from Icecast
    this.streamService.stopStream()

    await this.queue.obliterate({ force: true })

    this.logger.log('Radio stopped')
  }

  skip() {
    if (!this.isRunning) return

    this.streamService.stopCurrent()
  }

  async enqueueNext() {
    if (!this.isRunning) return

    const track = await this.radioTrackService.getNext()

    if (!track) {
      this.logger.warn('Playlist empty')
      return
    }

    await this.queue.add(
      PLAY_NEXT_JOB,
      { track },
      {
        attempts: 3,
        backoff: { type: 'fixed', delay: 2000 },
        delay: 0,
      },
    )
  }
}
