import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KafkaService implements OnModuleInit {
  private kafka!: Kafka;
  private readonly logger = new Logger(KafkaService.name);

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const brokers = this.config.get<string[]>('kafka.brokers');
    const username = this.config.get<string>('kafka.username');
    const password = this.config.get<string>('kafka.password');
    const clientId = this.config.get<string>('kafka.clientId');

    if (!brokers?.length) throw new Error('Kafka brokers missing');
    if (!username || !password) throw new Error('Kafka credentials missing');
    if (!clientId) throw new Error('Kafka clientId missing');

    this.kafka = new Kafka({
      clientId,
      brokers,

      ssl: true,

      sasl: {
        mechanism: 'plain',
        username,
        password,
      },
    });

    this.logger.log(`Kafka initialized → clientId=${clientId}`);
  }

  getConsumer() {
    const groupId = this.config.get<string>('kafka.groupId');
    if (!groupId) throw new Error('Kafka groupId missing');

    return this.kafka.consumer({ groupId });
  }

  getProducer() {
    return this.kafka.producer();
  }
}
