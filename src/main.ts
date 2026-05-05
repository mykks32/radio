import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useWebSocketAdapter(new IoAdapter(app));

  const port = Number(process.env.PORT) || 3000;
  const env = process.env.NODE_ENV ?? 'dev';

  await app.listen(port);

  logger.log(`${env} listening on port ${port}`);
}

void bootstrap();
