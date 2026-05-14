import type { ApiFailureResponse, ApiSuccessResponse } from '@sdd-monitor/api';

export function ok<TData>(data: TData, requestId = 'local'): ApiSuccessResponse<TData> {
  return {
    success: true,
    data,
    requestId,
    timestamp: new Date().toISOString(),
  };
}

export function fail(code: string, message: string, requestId = 'local'): ApiFailureResponse {
  return {
    success: false,
    error: {
      code,
      message,
    },
    requestId,
    timestamp: new Date().toISOString(),
  };
}
