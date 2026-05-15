import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  Kafka,
  logLevel,
  Partitioners,
  Producer,
  Admin,
  Consumer,
} from 'kafkajs'

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka!: Kafka
  private producer!: Producer
  private admin!: Admin

  private readonly logger = new Logger(KafkaService.name)
  private isConnected = false

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const brokers = this.config.get<string[]>('kafka.brokers')
    const username = this.config.get<string>('kafka.username')
    const password = this.config.get<string>('kafka.password')
    const clientId = this.config.get<string>('kafka.clientId')

    if (!brokers?.length) throw new Error('Kafka brokers missing')
    if (!username || !password) throw new Error('Kafka credentials missing')
    if (!clientId) throw new Error('Kafka clientId missing')

    this.kafka = new Kafka({
      clientId,
      brokers,
      ssl: { rejectUnauthorized: false },
      sasl: {
        mechanism: 'scram-sha-256',
        username,
        password,
      },
      logLevel: logLevel.INFO,
    })

    this.admin = this.kafka.admin()
    await this.admin.connect()

    this.logger.log('Kafka admin connected')

    await this.connectProducer()

    this.logger.log('Kafka initialized')
  }

  private async connectProducer() {
    if (this.isConnected) return

    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
      createPartitioner: Partitioners.LegacyPartitioner,
    })

    await this.producer.connect()

    this.isConnected = true
    this.logger.log('Kafka producer connected')
  }

  async send(topic: string, message: unknown, key?: string) {
    if (!this.isConnected) await this.connectProducer()

    await this.ensureTopic(topic)

    await this.producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(message),
        },
      ],
    })
  }

  async ensureTopic(topic: string) {
    const topics = await this.admin.listTopics()

    if (topics.includes(topic)) return

    await this.admin.createTopics({
      topics: [
        {
          topic,
          numPartitions: 1,
          replicationFactor: 1,
        },
      ],
    })

    this.logger.log(`Topic created: ${topic}`)
  }

  createConsumer(groupId?: string): Consumer {
    const resolvedGroupId = groupId ?? this.config.get<string>('kafka.groupId')

    if (!resolvedGroupId) throw new Error('Kafka groupId missing')

    return this.kafka.consumer({ groupId: resolvedGroupId })
  }

  async onModuleDestroy() {
    try {
      if (this.producer && this.isConnected) {
        await this.producer.disconnect()
        this.logger.log('Kafka producer disconnected')
      }

      if (this.admin) {
        await this.admin.disconnect()
        this.logger.log('Kafka admin disconnected')
      }

      this.isConnected = false
    } catch (err) {
      this.logger.error('Kafka shutdown error', err)
    }
  }

  isReady() {
    return this.isConnected
  }
}
