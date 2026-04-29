import { Controller, Post } from '@nestjs/common';
import { RadioService } from './radio.service';

@Controller('radio')
export class RadioController {
  constructor(private readonly radioService: RadioService) {}

  @Post('start')
  start() {
    this.radioService.startStream();
    return { message: 'Radio started' };
  }

  @Post('stop')
  stop() {
    this.radioService.stopStream();
    return { message: 'Radio stopped' };
  }
}
