import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Consumer, EachMessagePayload } from 'kafkajs';
import { KafkaService } from '../kafka/kafka.service';
import {
  TOPICS,
  RideRequestedEvent,
  DriverAssignedEvent,
  RideCompletedEvent,
} from './taxi.event';

// Maps each topic string to its expected event shape.
// This lets `parse()` return the correct type per topic at compile time.
type TopicPayloadMap = {
  [TOPICS.RIDE_REQUESTED]: RideRequestedEvent;
  [TOPICS.DRIVER_ASSIGNED]: DriverAssignedEvent;
  [TOPICS.RIDE_COMPLETED]: RideCompletedEvent;
};

// Deserialises the raw Kafka message buffer into the typed event for that topic.
// Throws early if the message is empty so handlers never receive null/undefined.
function parse<T extends keyof TopicPayloadMap>(
  topic: T,
  payload: EachMessagePayload,
): TopicPayloadMap[T] {
  const raw = payload.message.value?.toString();
  if (!raw) throw new Error(`Empty message on topic "${topic}"`);
  return JSON.parse(raw) as TopicPayloadMap[T];
}

@Injectable()
export class TaxiConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaxiConsumer.name);
  private consumer!: Consumer;

  constructor(private readonly kafka: KafkaService) {}

  async onModuleInit(): Promise<void> {
    // Create a consumer bound to this service's consumer group.
    // Kafka uses the group ID to track which offsets this service has already processed.
    this.consumer = this.kafka.createConsumer('taxi-group');
    await this.consumer.connect();

    // Subscribe to every topic defined in TOPICS in one loop
    // instead of repeating subscribe() calls manually per topic.
    for (const topic of Object.values(TOPICS)) {
      void (await this.consumer.subscribe({ topic, fromBeginning: false }));
    }

    // Start polling Kafka. eachMessage fires once per message in arrival order.
    // The switch routes each message to its dedicated typed handler.
    await this.consumer.run({
      eachMessage: async (payload): Promise<void> => {
        switch (payload.topic) {
          case TOPICS.RIDE_REQUESTED:
            return await this.onRideRequested(
              parse(TOPICS.RIDE_REQUESTED, payload),
            );
          case TOPICS.DRIVER_ASSIGNED:
            return this.onDriverAssigned(
              parse(TOPICS.DRIVER_ASSIGNED, payload),
            );
          case TOPICS.RIDE_COMPLETED:
            return this.onRideCompleted(parse(TOPICS.RIDE_COMPLETED, payload));
        }
      },
    });
  }

  // Disconnect cleanly when the NestJS app shuts down
  // so Kafka can rebalance partitions to other consumers immediately.
  async onModuleDestroy(): Promise<void> {
    await this.kafka.shutdownConsumer(this.consumer);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────
  // Each handler receives a fully typed event — no casting needed here.
  // Replace the logger calls with real business logic (DB writes, HTTP calls, etc).

  private async onRideRequested(event: RideRequestedEvent): Promise<void> {
    await Promise.resolve();
    this.logger.log(`🚕 ${event.userId}: ${event.pickup} → ${event.dropoff}`);
  }

  private onDriverAssigned(event: DriverAssignedEvent): void {
    this.logger.log(`✅ Driver ${event.driverId} — ETA ${event.eta} mins`);
  }

  private onRideCompleted(event: RideCompletedEvent): void {
    this.logger.log(`🏁 Ride ${event.rideId} — $${event.fare}`);
  }
}
