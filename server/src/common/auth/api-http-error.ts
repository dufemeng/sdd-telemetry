export class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = code;
  }
}

export function unauthorized(message = 'Authentication required'): ApiHttpError {
  return new ApiHttpError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Permission denied'): ApiHttpError {
  return new ApiHttpError(403, 'FORBIDDEN', message);
}

export function conflict(message: string): ApiHttpError {
  return new ApiHttpError(409, 'CONFLICT', message);
}
