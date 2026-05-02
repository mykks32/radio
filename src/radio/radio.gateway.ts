import { Controller, Get, Res, OnModuleInit, Logger } from '@nestjs/common';
import {
  RadioStreamService,
  RadioChunkEvent,
} from './services/radio-stream.service';
import type { Response } from 'express';

/**
 * Server-Sent Events gateway: clients connect here to receive the raw audio stream.
 * Use an <audio> tag or ffmpeg piped to this endpoint.
 *
 * For binary audio streaming, we use a plain HTTP endpoint (not WebSocket)
 * because browsers handle audio/mpeg streams natively.
 */
@Controller('radio')
export class RadioGateway implements OnModuleInit {
  private readonly logger = new Logger(RadioGateway.name);
  private readonly clients = new Set<Response>();

  constructor(private readonly streamService: RadioStreamService) {}

  onModuleInit() {
    // Broadcast every chunk to all connected clients
    this.streamService.on('chunk', ({ chunk }: RadioChunkEvent) => {
      for (const client of this.clients) {
        try {
          client.write(chunk);
        } catch {
          this.clients.delete(client);
        }
      }
    });
  }

  /**
   * GET /radio/stream
   * Connect an audio player to this endpoint:
   *   <audio src="http://localhost:3000/radio/stream" controls autoplay />
   *   or: ffplay http://localhost:3000/radio/stream
   */
  @Get('stream')
  stream(@Res() res: Response) {
    this.logger.log(`New listener connected (total: ${this.clients.size + 1})`);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if proxied
    res.flushHeaders();

    this.clients.add(res);

    res.on('close', () => {
      this.clients.delete(res);
      this.logger.log(`Listener disconnected (total: ${this.clients.size})`);
    });
  }
}
