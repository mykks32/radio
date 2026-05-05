import { Controller, Post, Get } from '@nestjs/common';
import { RadioService } from './services/radio.service';

@Controller('radio')
export class RadioController {
  constructor(private readonly radioService: RadioService) {}

  @Post('start')
  async start() {
    await this.radioService.start();
    return { status: 'started' };
  }

  @Post('stop')
  async stop() {
    await this.radioService.stop();
    return { status: 'stopped' };
  }

  @Post('skip')
  async skip() {
    await this.radioService.skip();
    return { status: 'skipped' };
  }

  @Get('status')
  status() {
    return {
      status: this.radioService.status,
      nowPlaying: this.radioService.nowPlaying,
    };
  }
}
