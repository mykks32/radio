import { Module } from '@nestjs/common';
import { KafkaModule } from '../kafka/kafka.module';
import { TaxiService } from './taxi.service';
import { TaxiConsumer } from './taxi.consumer';
import { TaxiController } from './taxi.controller';

@Module({
  imports: [KafkaModule],
  providers: [TaxiService, TaxiConsumer],
  controllers: [TaxiController],
})
export class TaxiModule {}
