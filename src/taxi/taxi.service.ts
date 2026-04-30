import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { TOPICS } from './taxi.event';

@Injectable()
export class TaxiService implements OnModuleInit {
  constructor(private readonly kafka: KafkaService) {}

  async onModuleInit() {
    await this.kafka.connectProducer();
  }

  async requestRide(userId: string, pickup: string, dropoff: string) {
    const rideId = crypto.randomUUID();
    await this.kafka.send(
      TOPICS.RIDE_REQUESTED,
      { rideId, userId, pickup, dropoff },
      rideId,
    );
    return rideId;
  }

  async assignDriver(rideId: string, driverId: string, eta: number) {
    await this.kafka.send(
      TOPICS.DRIVER_ASSIGNED,
      { rideId, driverId, eta },
      rideId,
    );
  }

  async completeRide(rideId: string, fare: number, duration: number) {
    await this.kafka.send(
      TOPICS.RIDE_COMPLETED,
      { rideId, fare, duration },
      rideId,
    );
  }
}
