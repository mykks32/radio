import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Consumer, Kafka, Producer, logLevel, Partitioners } from 'kafkajs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka!: Kafka;
  private producer!: Producer;
  private readonly logger = new Logger(KafkaService.name);
  private isConnected = false;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const brokers = this.config.get<string[]>('kafka.brokers');
    const username = this.config.get<string>('kafka.username');
    const password = this.config.get<string>('kafka.password');
    const clientId = this.config.get<string>('kafka.clientId');

    const isProd = process.env.NODE_ENV === 'production';

    if (!brokers?.length) throw new Error('Kafka brokers missing');
    if (!username || !password) throw new Error('Kafka credentials missing');
    if (!clientId) throw new Error('Kafka clientId missing');

    this.kafka = new Kafka({
      clientId,
      brokers,
      ssl: {
        rejectUnauthorized: false,
      },
      logLevel: isProd ? logLevel.WARN : logLevel.INFO,
      connectionTimeout: 5000,
      requestTimeout: 30000,
      retry: {
        initialRetryTime: 300,
        retries: 8,
        maxRetryTime: 30000,
        factor: 0.2,
      },
      sasl: {
        mechanism: 'scram-sha-256',
        username,
        password,
      },
    });

    await this.connectProducer();

    this.logger.log(`Kafka initialized → clientId=${clientId}`);
  }

  async connectProducer() {
    if (this.isConnected) return;

    try {
      this.producer = this.producer = this.kafka.producer({
        idempotent: true,
        maxInFlightRequests: 1,
        retry: {
          retries: 5,
        },
        createPartitioner: Partitioners.LegacyPartitioner,
      });

      await this.producer.connect();
      this.isConnected = true;

      this.logger.log('Kafka producer connected');
    } catch (err: unknown) {
      this.logger.error(
        'Failed to connect producer',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  async send(topic: string, message: unknown, key?: string) {
    if (!this.producer || !this.isConnected) {
      await this.connectProducer();
    }

    try {
      await this.producer.send({
        topic,
        compression: 1,
        messages: [
          {
            key,
            value: JSON.stringify(message),
          },
        ],
      });
    } catch (err: unknown) {
      this.logger.error(
        `Failed to send message to ${topic}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  createConsumer(groupId?: string): Consumer {
    const resolvedGroupId = groupId ?? this.config.get<string>('kafka.groupId');

    if (!resolvedGroupId) throw new Error('Kafka groupId missing');

    return this.kafka.consumer({
      groupId: resolvedGroupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async shutdownConsumer(consumer: Consumer) {
    try {
      await consumer.disconnect();
      this.logger.log('Kafka consumer disconnected');
    } catch (err: unknown) {
      this.logger.error(
        'Error disconnecting consumer',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async onModuleDestroy() {
    try {
      if (this.producer) {
        await this.producer.disconnect();
        this.logger.log('Kafka producer disconnected');
      }
    } catch (err: unknown) {
      this.logger.error(
        'Error during Kafka shutdown',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }
}
