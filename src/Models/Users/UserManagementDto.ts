import { z } from 'zod';

export const userProfileSchema = z.enum(['Admin', 'Visor']);
export const userStatusSchema = z.enum(['Activo', 'Inactivo']);

export const createManagedUserSchema = z
  .object({
    nombre: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(255),
    password: z.string().min(8).max(128),
    perfil: userProfileSchema,
    estatus: userStatusSchema.optional(),
  })
  .strict();

export const updateManagedUserSchema = z
  .object({
    nombre: z.string().trim().min(1).max(160).optional(),
    email: z.string().trim().email().max(255).optional(),
    password: z.string().min(8).max(128).optional(),
    perfil: userProfileSchema.optional(),
    estatus: userStatusSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar.',
  });

export const managedUserIdParamsSchema = z.object({
  id: z.coerce.number().int().positive().safe(),
});

export interface ManagedUserDto {
  id: number;
  nombre: string;
  email: string;
  perfil: 'Admin' | 'Visor';
  fecha_alta: string;
  estatus: 'Activo' | 'Inactivo';
}

const managedUserResponseSchema = z.object({
  id: z.number().int().positive(),
  nombre: z.string(),
  email: z.string().email(),
  perfil: userProfileSchema,
  fecha_alta: z.string().datetime(),
  estatus: userStatusSchema,
});

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
});

export const managedUserApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.union([managedUserResponseSchema, z.array(managedUserResponseSchema)]).nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});
