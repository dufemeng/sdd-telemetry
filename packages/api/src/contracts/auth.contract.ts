import { z } from 'zod';
import { ISODateTimeSchema, IdSchema } from './common.contract';

export const AuthRoleSchema = z.enum(['super_admin', 'viewer']);
export const AuthUserStatusSchema = z.enum(['active', 'disabled']);

export const AuthUsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'username only supports letters, numbers, dot, underscore and dash');

export const AuthPasswordSchema = z.string().min(12).max(256);

export const AuthSessionUserSchema = z.object({
  id: IdSchema,
  username: z.string(),
  displayName: z.string(),
  role: AuthRoleSchema,
});

export const AuthUserSchema = AuthSessionUserSchema.extend({
  status: AuthUserStatusSchema,
  lastLoginAt: ISODateTimeSchema.nullable(),
  createdAt: ISODateTimeSchema,
  updatedAt: ISODateTimeSchema,
});

export const AuthLoginRequestSchema = z.object({
  username: AuthUsernameSchema,
  password: z.string().min(1).max(256),
});

export const CreateAuthUserRequestSchema = z.object({
  username: AuthUsernameSchema,
  displayName: z.string().trim().min(1).max(64),
  password: AuthPasswordSchema,
  role: AuthRoleSchema.default('viewer'),
});

export const UpdateAuthUserRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(64).optional(),
    role: AuthRoleSchema.optional(),
  })
  .refine(input => input.displayName !== undefined || input.role !== undefined, {
    message: 'at least one field must be provided',
  });

export const ResetAuthPasswordRequestSchema = z.object({
  password: AuthPasswordSchema,
});

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: AuthPasswordSchema,
});

export const HealthzSchema = z.object({
  status: z.literal('ok'),
});

export type AuthRole = z.infer<typeof AuthRoleSchema>;
export type AuthUserStatus = z.infer<typeof AuthUserStatusSchema>;
export type AuthSessionUser = z.infer<typeof AuthSessionUserSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthLoginRequest = z.infer<typeof AuthLoginRequestSchema>;
export type CreateAuthUserRequest = z.infer<typeof CreateAuthUserRequestSchema>;
export type UpdateAuthUserRequest = z.infer<typeof UpdateAuthUserRequestSchema>;
export type ResetAuthPasswordRequest = z.infer<typeof ResetAuthPasswordRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
