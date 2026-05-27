import { Catch, MidwayHttpError } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import { ZodError } from 'zod';
import { ApiHttpError } from '../auth/api-http-error';
import { fail } from '../response/api-response';

@Catch()
export class ApiErrorFilter {
  async catch(err: Error, ctx: Context) {
    const requestId = (ctx.get('x-request-id') || 'local') as string;

    if (err instanceof ZodError) {
      const message = err.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      ctx.status = 400;
      return fail('VALIDATION_FAILED', message, requestId);
    }

    if (err instanceof ApiHttpError) {
      ctx.status = err.status;
      return fail(err.code, err.message, requestId);
    }

    if (err instanceof MidwayHttpError) {
      ctx.status = err.status;
      return fail(err.name, err.message, requestId);
    }

    ctx.status = 500;
    ctx.logger?.error?.('[ApiErrorFilter] unhandled error', err);
    return fail('INTERNAL_ERROR', err.message || 'Internal Server Error', requestId);
  }
}
