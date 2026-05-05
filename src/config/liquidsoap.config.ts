import { registerAs } from '@nestjs/config';

export const LiquidsoapConfig = registerAs('liquidsoap', () => ({
  host: process.env.LIQUIDSOAP_HOST ?? '127.0.0.1',
  port: process.env.LIQUIDSOAP_PORT ?? '1234',
}));
