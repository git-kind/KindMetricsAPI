import { z } from 'zod';

export const createUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(160),
  password: z.string().min(12).max(128),
  companyGuid: z.string().uuid().optional(),
});

export type CreateUserRequestDto = z.infer<typeof createUserRequestSchema>;
export const userCreateSchema = createUserRequestSchema;
