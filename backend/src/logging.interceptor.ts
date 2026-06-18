import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ method: string; url: string }>();
    const { method, url } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const reply = context.switchToHttp().getResponse<{ statusCode: number }>();
          const duration = Date.now() - start;
          this.logger.log(
            `[REQUEST] ${method} ${url} status=${reply.statusCode} duration=${duration}ms`,
          );
        },
        error: (err: { status?: number }) => {
          const duration = Date.now() - start;
          const status = err?.status ?? 500;
          this.logger.log(`[REQUEST] ${method} ${url} status=${status} duration=${duration}ms`);
        },
      }),
    );
  }
}
