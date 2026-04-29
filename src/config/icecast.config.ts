import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('IceCastConfig');

export const IceCastConfig = registerAs('icecast', () => {
  const host = process.env.ICECAST_HOST;
  const port = Number(process.env.ICECAST_PORT);
  const mount = process.env.ICECAST_MOUNT;
  const user = process.env.ICECAST_USER;
  const pass = process.env.ICECAST_PASS;

  if (!host || !port || !mount) {
    logger.error('Icecast config missing required fields');
    throw new Error('Invalid Icecast config');
  }

  logger.log(`Icecast → ${host}:${port}${mount}`);

  return {
    host,
    port,
    mount,
    user,
    pass,
  };
});
