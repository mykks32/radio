import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { Logger } from '@nestjs/common'
import { QUEUE } from '../../queue/queue.constant'
import { KafkaService } from '../../kafka/kafka.service'
import { RadioStreamService } from '../services/radio-stream.service'
import { KafkaTopic } from '../../kafka/kafka.constant'

export const PLAY_NEXT_JOB = 'play-next'

@Processor(QUEUE.RADIO_QUEUE)
export class RadioProcessor extends WorkerHost {
  private readonly logger = new Logger(RadioProcessor.name)

  constructor(
    private readonly kafka: KafkaService,
    private readonly streamService: RadioStreamService,
  ) {
    super()
  }

  async process(
    job: Job,
  ): Promise<{ played: boolean; trackId?: string | null }> {
    if (job.name !== PLAY_NEXT_JOB) return { played: false }

    const track = job.data.track

    if (!track) {
      this.logger.warn('No track in job data')
      return { played: false }
    }

    this.logger.log(`▶ Now playing: ${track.title}`)

    await this.kafka.send(KafkaTopic.track_started, [
      {
        value: {
          trackId: track.id,
          ts: Date.now(),
        },
      },
    ])

    this.streamService.streamTrack(track)

    await this.kafka.send(KafkaTopic.track_ended, [
      {
        value: {
          trackId: track.id,
          ts: Date.now(),
        },
      },
    ])

    return {
      played: true,
      trackId: track.id,
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`)
  }
}
