import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

export type KafkaConfigType = {
  clientId: string;
  brokers: string[];
  groupId: string;
  username: string;
  password: string;
};

const logger = new Logger('KafkaConfig');

export const KafkaConfig = registerAs('kafka', (): KafkaConfigType => {
  const clientId = process.env.KAFKA_CLIENT_ID;
  const brokersRaw = process.env.KAFKA_BROKERS;
  const groupId = process.env.KAFKA_GROUP_ID;
  const username = process.env.KAFKA_USERNAME;
  const password = process.env.KAFKA_PASSWORD;

  const brokers = brokersRaw?.split(',').map((b) => b.trim()) ?? [];

  // validate brokers
  if (!brokersRaw || brokers.length === 0) {
    logger.error('KAFKA_BROKERS is missing or empty');
    throw new Error('Kafka brokers are required');
  }

  // validate auth
  if (!username || !password) {
    logger.error('Kafka username/password missing');
    throw new Error('Kafka credentials are required');
  }

  // validate clientId
  if (!clientId) {
    logger.error('KAFKA_CLIENT_ID is missing');
    throw new Error('Kafka clientId is required');
  }

  logger.log(
    `Kafka config loaded → clientId=${clientId}, brokers=${brokers.join(',')}`,
  );

  return {
    clientId,
    brokers,
    groupId: groupId ?? 'radio-group',
    username,
    password,
  };
});
