import { z } from 'zod';

export const userManagementProfileSchema = z.enum(['Admin', 'Visor']);

export const userManagementIdParamsSchema = z.object({
  id: z.coerce.number().int().positive().safe(),
});

export const createManagedUserSchema = z
  .object({
    nombre: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
    perfil: userManagementProfileSchema,
    password: z.string().min(8).max(128),
  })
  .strict();

export const updateManagedUserSchema = z
  .object({
    nombre: z.string().trim().min(1).max(160).optional(),
    email: z
      .string()
      .trim()
      .email()
      .max(255)
      .transform((value) => value.toLowerCase())
      .optional(),
    perfil: userManagementProfileSchema.optional(),
    password: z.string().min(8).max(128).optional(),
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar.',
  });

export interface ManagedUserDto {
  id: number;
  nombre: string;
  email: string;
  perfil: 'Admin' | 'Visor';
}
