import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * LoggerMiddleware
 *
 * Logs HTTP requests with method, URL, status, duration, and request ID.
 * Measures request duration and logs on response finish.
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const requestId = req.headers['x-request-id'] as string;
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;
      this.logger.log(
        `[${method}] ${originalUrl} ${statusCode} - ${duration}ms - requestId ${requestId}`,
      );
    });

    next();
  }
}
