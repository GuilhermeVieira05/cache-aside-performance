import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConsoleLogger } from '@nestjs/common';
import { createWriteStream, mkdirSync } from 'fs';
import { dirname } from 'path';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './logging.interceptor';

class FileAndConsoleLogger extends ConsoleLogger {
  private readonly stream: ReturnType<typeof createWriteStream>;

  constructor(logFile: string) {
    super();
    mkdirSync(dirname(logFile), { recursive: true });
    this.stream = createWriteStream(logFile, { flags: 'a' });
  }

  protected formatMessage(
    logLevel: 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal',
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
  ): string {
    const line = super.formatMessage(logLevel, message, pidMessage, formattedLogLevel, contextMessage, timestampDiff);
    this.stream.write(line);
    return line;
  }
}

async function bootstrap() {
  const logFile = process.env.LOG_FILE ?? '/app/logs/development.log';
  const logger  = new FileAndConsoleLogger(logFile);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { logger },
  );

  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`, 'Bootstrap');
}
bootstrap();
