import { Body, Controller, Post } from '@nestjs/common';
import { TaxiService } from './taxi.service';

@Controller('taxi')
export class TaxiController {
  constructor(private readonly taxi: TaxiService) {}

  @Post('ride/request')
  requestRide(
    @Body() body: { userId: string; pickup: string; dropoff: string },
  ) {
    return this.taxi.requestRide(body.userId, body.pickup, body.dropoff);
  }

  @Post('ride/assign')
  assignDriver(
    @Body() body: { rideId: string; driverId: string; eta: number },
  ) {
    return this.taxi.assignDriver(body.rideId, body.driverId, body.eta);
  }

  @Post('ride/complete')
  completeRide(
    @Body() body: { rideId: string; fare: number; duration: number },
  ) {
    return this.taxi.completeRide(body.rideId, body.fare, body.duration);
  }
}
