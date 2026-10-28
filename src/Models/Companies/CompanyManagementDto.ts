import { z } from 'zod';

export const companyStatusSchema = z.enum(['activo', 'inactivo']);

export const createCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    code: z.string().trim().min(1).max(40),
    razon_social: z.string().trim().min(1).max(255),
    rfc: z
      .string()
      .trim()
      .max(50)
      .transform((value) => value.toUpperCase())
      .nullable()
      .default(null),
    direccion: z.string().trim().max(255).nullable().default(null),
    telefono: z.string().trim().max(50).nullable().default(null),
  })
  .strict();

export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    code: z.string().trim().min(1).max(40).optional(),
    razon_social: z.string().trim().min(1).max(255).optional(),
    rfc: z
      .string()
      .trim()
      .max(50)
      .transform((value) => value.toUpperCase())
      .nullable()
      .optional(),
    direccion: z.string().trim().max(255).nullable().optional(),
    telefono: z.string().trim().max(50).nullable().optional(),
    estado: companyStatusSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe proporcionar al menos un campo para actualizar.',
  });

export const companyIdParamsSchema = z.object({
  id: z.coerce.number().int().positive().safe(),
});

export interface CompanyManagementDto {
  id: number;
  guid: string;
  name: string;
  code: string;
  razon_social: string;
  rfc: string | null;
  direccion: string | null;
  telefono: string | null;
  created_at: string | null;
  estado: 'activo' | 'inactivo';
}

const companyResponseSchema = z.object({
  id: z.number().int().positive(),
  guid: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  razon_social: z.string(),
  rfc: z.string().nullable(),
  direccion: z.string().nullable(),
  telefono: z.string().nullable(),
  created_at: z.string().datetime().nullable(),
  estado: companyStatusSchema,
});

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
});

export const companyApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.union([companyResponseSchema, z.array(companyResponseSchema)]).nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export const companyManagementAccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    perfil: z.enum(['Admin', 'Visor']),
    canManage: z.boolean(),
  }).nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});
