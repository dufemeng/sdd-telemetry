import { z } from 'zod';

export const ISODateTimeSchema = z.string().datetime();
export const IdSchema = z.string().min(1);

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const createApiResponseSchema = <TData extends z.ZodType>(data: TData) =>
  z.object({
    success: z.literal(true),
    data,
    requestId: z.string(),
    timestamp: ISODateTimeSchema,
  });

export const ApiFailureResponseSchema = z.object({
  success: z.literal(false),
  error: ApiErrorSchema,
  requestId: z.string(),
  timestamp: ISODateTimeSchema,
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiSuccessResponse<TData> = {
  success: true;
  data: TData;
  requestId: string;
  timestamp: string;
};
export type ApiFailureResponse = z.infer<typeof ApiFailureResponseSchema>;
export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiFailureResponse;

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
