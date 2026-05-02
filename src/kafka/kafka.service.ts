import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Consumer, Kafka, Producer, logLevel } from 'kafkajs';
import { ConfigService } from '@nestjs/config';

/**
 * KafkaService
 *
 * Central wrapper around KafkaJS client.
 *
 * Responsibilities:
 * - Initialize Kafka connection with secure config
 * - Manage producer lifecycle
 * - Provide safe message publishing
 * - Create and manage consumers
 * - Handle graceful shutdown
 *
 * Designed for event-driven architecture (radio events, playlist updates, analytics).
 */
@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka!: Kafka;
  private producer!: Producer;
  private readonly logger = new Logger(KafkaService.name);
  private isConnected = false;

  constructor(private config: ConfigService) {}

  /**
   * Initialize Kafka client on module startup.
   *
   * Flow:
   * 1. Load configuration from ConfigService
   * 2. Validate required environment values
   * 3. Create Kafka instance with security + retry settings
   */
  onModuleInit() {
    const brokers = this.config.get<string[]>('kafka.brokers');
    const username = this.config.get<string>('kafka.username');
    const password = this.config.get<string>('kafka.password');
    const clientId = this.config.get<string>('kafka.clientId');

    const isProd = process.env.NODE_ENV === 'production';

    // ─────────────────────────────────────────────
    // VALIDATION (fail fast if misconfigured)
    // ─────────────────────────────────────────────
    if (!brokers?.length) throw new Error('Kafka brokers missing');
    if (!username || !password) throw new Error('Kafka credentials missing');
    if (!clientId) throw new Error('Kafka clientId missing');

    // ─────────────────────────────────────────────
    // KAFKA INITIALIZATION
    // ─────────────────────────────────────────────
    this.kafka = new Kafka({
      clientId,
      brokers,

      // SSL config (disabled strict validation here for flexibility in infra setups)
      ssl: {
        rejectUnauthorized: false,
      },

      // Log verbosity depending on environment
      logLevel: isProd ? logLevel.WARN : logLevel.INFO,

      connectionTimeout: 5000,
      requestTimeout: 30000,

      // Retry strategy for resilience
      retry: {
        initialRetryTime: 300,
        retries: 8,
        maxRetryTime: 30000,
        factor: 0.2,
      },

      // SASL authentication (SCRAM-SHA-256)
      sasl: {
        mechanism: 'scram-sha-256',
        username,
        password,
      },
    });

    this.logger.log(`Kafka initialized → clientId=${clientId}`);
  }

  // ─────────────────────────────────────────────
  // PRODUCER MANAGEMENT
  // ─────────────────────────────────────────────

  /**
   * Connect Kafka producer (idempotent safe).
   *
   * Ensures only one active producer connection exists.
   */
  async connectProducer() {
    if (this.isConnected) return;

    try {
      // Create producer with idempotent guarantees
      this.producer = this.kafka.producer({
        idempotent: true,
        maxInFlightRequests: 5,
        retry: {
          retries: 5,
        },
      });

      await this.producer.connect();
      this.isConnected = true;

      this.logger.log('Kafka producer connected');
    } catch (err: unknown) {
      // Log full stack if available
      this.logger.error(
        'Failed to connect producer',
        err instanceof Error ? err.stack : String(err),
      );

      throw err;
    }
  }

  /**
   * Send event/message to Kafka topic.
   *
   * Flow:
   * 1. Validate producer exists
   * 2. Serialize message
   * 3. Send to Kafka with optional key
   *
   * @param topic Kafka topic name
   * @param message Payload (auto JSON serialized)
   * @param key Optional partition key
   */
  async send(topic: string, message: unknown, key?: string) {
    if (!this.producer) {
      throw new Error('Producer not initialized. Call connectProducer first.');
    }

    try {
      await this.producer.send({
        topic,

        // Enables compression for reduced network usage
        compression: 1, // gzip

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

  // ─────────────────────────────────────────────
  // CONSUMER MANAGEMENT
  // ─────────────────────────────────────────────
  /**
   * Create Kafka consumer instance.
   *
   * @param groupId Optional consumer group override
   * @returns Kafka consumer instance
   */
  createConsumer(groupId?: string): Consumer {
    const resolvedGroupId = groupId ?? this.config.get<string>('kafka.groupId');

    if (!resolvedGroupId) throw new Error('Kafka groupId missing');

    return this.kafka.consumer({
      groupId: resolvedGroupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  /**
   * Gracefully disconnect a Kafka consumer.
   */
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

  // ─────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────

  /**
   * Gracefully shutdown Kafka producer on app termination.
   */
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

  /**
   * Check if producer is connected and ready.
   */
  isReady(): boolean {
    return this.isConnected;
  }
}
