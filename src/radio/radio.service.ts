import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as fs from 'fs';

@Injectable()
export class RadioService {
  private req: http.ClientRequest | null = null;
  private readonly logger = new Logger(RadioService.name);
  constructor(private readonly configService: ConfigService) {}

  startStream() {
    const host = this.configService.get<string>('icecast.host', '127.0.0.1');
    const port = this.configService.get<number>('icecast.port', 8000);
    const mount = this.configService.get<string>('icecast.mount', '/live.mp3');
    const user = this.configService.get<string>('icecast.user', 'source');
    const pass = this.configService.get<string>('icecast.pass', 'hackme');

    const options = {
      hostname: host,
      port,
      path: mount,
      method: 'SOURCE',
      headers: {
        'Content-Type': 'audio/mpeg',
        Authorization:
          'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
        'Ice-Name': 'NestJS Radio',
        'Ice-Description': 'Simple NestJS Icecast Stream',
        'Ice-Public': '1',
      },
    };

    this.req = http.request(options, (res) => {
      console.log('Connected to Icecast:', res.statusCode);
    });

    this.req.on('error', (err) => {
      this.logger.error('Stream error:', JSON.stringify(err));
    });

    const streamAudio = () => {
      if (!this.req) return;
      const file = fs.createReadStream('./audio/song2.mp3');
      file.pipe(this.req, { end: false });
      file.on('end', streamAudio);
      file.on('error', (err) => console.error('File error:', err));
    };

    streamAudio();

    this.logger.log('Radio stream started');
  }

  stopStream() {
    if (this.req) {
      this.req.destroy();
      this.req = null;
      this.logger.log('Radio stream stopped');
    }
  }
}
