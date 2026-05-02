import { Controller, Post, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { RadioService } from './services/radio.service';
import { TrackMeta } from '../playlist/playlist.types';

@Controller('radio')
export class RadioController {
  constructor(private readonly radioService: RadioService) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  async start(): Promise<{ status: string }> {
    await this.radioService.start();
    return { status: 'started' };
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  async stop(): Promise<{ status: string }> {
    await this.radioService.stop();
    return { status: 'stopped' };
  }

  @Post('skip')
  @HttpCode(HttpStatus.OK)
  async skip(): Promise<{ status: string }> {
    await this.radioService.skip();
    return { status: 'skipped' };
  }

  @Get('status')
  status(): { status: string; nowPlaying: TrackMeta | null } {
    return {
      status: this.radioService.status,
      nowPlaying: this.radioService.nowPlaying,
    };
  }
}
