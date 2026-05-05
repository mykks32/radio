import { registerAs } from '@nestjs/config';

export const HlsConfig = registerAs('hls', () => ({
  outputDir: process.env.HLS_OUTPUT_DIR ?? '/tmp/hls',
}));
