import { z } from 'zod';

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

export type LoginRequestDto = z.infer<typeof loginRequestSchema>;
export const loginSchema = loginRequestSchema;
