import { z } from 'zod';

export const passwordRecoveryRequestSchema = z.object({
  email: z.string().trim().email().max(255),
});

export const passwordRecoveryValidateSchema = z.object({
  email: z.string().trim().email().max(255),
  otp: z.string().trim().regex(/^\d{6}$/).length(6),
});

export const passwordRecoveryUpdateSchema = z.object({
  email: z.string().trim().email().max(255),
  otp: z.string().trim().regex(/^\d{6}$/).length(6),
  password: z.string().min(8).max(128),
});

export type PasswordRecoveryRequestDto = z.infer<typeof passwordRecoveryRequestSchema>;
export type PasswordRecoveryValidateDto = z.infer<typeof passwordRecoveryValidateSchema>;
export type PasswordRecoveryUpdateDto = z.infer<typeof passwordRecoveryUpdateSchema>;
