import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { Logger } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'

const logger = new Logger('Bootstrap')

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  })

  app.useWebSocketAdapter(new IoAdapter(app))
  app.enableShutdownHooks()

  const port = Number(process.env.PORT) || 3000
  const env = process.env.NODE_ENV ?? 'dev'

  await app.listen(port)

  logger.log(`${env} listening on port ${port}`)

  // Graceful shutdown handlers (IMPORTANT for Kubernetes/Docker)
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']

  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.warn(`Received ${signal}, shutting down gracefully...`)

      try {
        await app.close() // triggers OnModuleDestroy hooks
        logger.log('App shutdown complete')
      } catch (err) {
        logger.error('Error during shutdown', err)
      } finally {
        process.exit(0)
      }
    })
  })
}

void bootstrap()
