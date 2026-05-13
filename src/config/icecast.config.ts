import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('IceCastConfig');

export const IceCastConfig = registerAs('icecast', () => {
  const protocol = process.env.ICECAST_PROTOCOL || 'icecast';

  const host = process.env.ICECAST_HOST;
  const port = Number(process.env.ICECAST_PORT || 8000);
  const mount = process.env.ICECAST_MOUNT || '/song.mp3';

  const user = process.env.ICECAST_USER;
  const pass = process.env.ICECAST_PASS;

  /**
   * Validation
   */
  if (!host) {
    logger.error('ICECAST_HOST is missing');
    throw new Error('Invalid Icecast config');
  }

  if (!user || !pass) {
    logger.error('ICECAST_USER or ICECAST_PASS is missing');
    throw new Error('Invalid Icecast credentials');
  }

  /**
   * Source URL used by FFmpeg / Liquidsoap
   * Example:
   * icecast://source:hackme@localhost:8000/song.mp3
   */
  const sourceUrl =
    `${protocol}://${user}:${pass}` + `@${host}:${port}${mount}`;

  /**
   * Public playback URL
   * Example:
   * http://localhost:8000/song.mp3
   */
  const publicUrl = `http://${host}:${port}${mount}`;

  /**
   * Safe log (password masked)
   */
  logger.log(`Icecast source URL → ${sourceUrl.replace(/:(.*?)@/, ':***@')}`);

  return {
    host,
    port,
    mount,
    sourceUrl,
    publicUrl,
  };
});
