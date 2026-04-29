import { registerAs } from '@nestjs/config';

export const IceCastConfig = registerAs('icecast', () => {
  const host = process.env.ICECAST_HOST ?? '127.0.0.1';
  const port = parseInt(process.env.ICECAST_PORT ?? '8000', 10);
  const mountRaw = process.env.ICECAST_MOUNT ?? '/live.mp3';
  const user = process.env.ICECAST_USER ?? 'source';
  const pass = process.env.ICECAST_PASS ?? 'hackme';

  const mount = mountRaw.startsWith('/') ? mountRaw : `/${mountRaw}`;

  return {
    host,
    port,
    mount,
    user,
    pass,
    url: `http://${host}:${port}${mount}`,
  };
});
