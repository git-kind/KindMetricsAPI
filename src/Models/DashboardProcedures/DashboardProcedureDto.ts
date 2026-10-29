import { z } from 'zod';

const guid = z.string().uuid();
const expectedVersion = z.number().int().positive().max(4_294_967_295).safe();
const dataType = z.enum(['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME']);
const procedureName = z.string().regex(/^sp_dashboard_[a-z0-9_]{1,112}$/);

const parametersSchema = z
  .object({
    schemaVersion: z.literal(1),
    parameters: z
      .array(z.object({ name: z.string().regex(/^p_[a-z][a-z0-9_]{0,62}$/), type: dataType, required: z.boolean() }).strict())
      .max(64),
  })
  .strict()
  .refine((schema) => new Set(schema.parameters.map((parameter) => parameter.name)).size === schema.parameters.length, {
    message: 'Los nombres de parámetros deben ser únicos.',
  });

const resultSchema = z
  .object({
    schemaVersion: z.literal(1),
    columns: z.array(z.object({ name: z.string().min(1).max(128), type: dataType }).strict()).max(256),
  })
  .strict()
  .refine((schema) => new Set(schema.columns.map((column) => column.name)).size === schema.columns.length, {
    message: 'Los nombres de columnas deben ser únicos.',
  });

export const dashboardProcedureGuidParamsSchema = z.object({ guid });

export const createDashboardProcedureSchema = z
  .object({
    procedureName,
    description: z.string().max(20_000).nullable().optional(),
    parametersSchema,
    resultSchema,
    executionTimeoutSeconds: z.number().int().min(1).max(300).default(30),
  })
  .strict();

export const updateDashboardProcedureSchema = z
  .object({
    procedureName: procedureName.optional(),
    description: z.string().max(20_000).nullable().optional(),
    parametersSchema: parametersSchema.optional(),
    resultSchema: resultSchema.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    approvalReference: z.string().trim().min(1).max(200).optional(),
    executionTimeoutSeconds: z.number().int().min(1).max(300).optional(),
    expectedVersion,
  })
  .strict()
  .refine((payload) => Object.keys(payload).some((key) => key !== 'expectedVersion'), {
    message: 'Debe proporcionar al menos una propiedad para actualizar.',
  })
  .refine((payload) => payload.status !== 'ACTIVE' || Boolean(payload.approvalReference), {
    path: ['approvalReference'],
    message: 'Activar el procedimiento requiere una referencia de aprobación.',
  });

export const dashboardProcedureResponseSchema = z.object({
  id: z.number().int().positive().safe(),
  guid,
  procedureName,
  description: z.string().nullable(),
  parametersSchema,
  resultSchema,
  status: z.enum(['PENDING', 'ACTIVE', 'INACTIVE']),
  executionTimeoutSeconds: z.number().int().positive().max(300),
  version: z.number().int().positive().safe(),
  createdAt: z.string().datetime(),
  createdBy: z.number().int().positive().safe(),
  updatedAt: z.string().datetime().nullable(),
  updatedBy: z.number().int().positive().safe().nullable(),
  reviewedBy: z.number().int().positive().safe().nullable(),
  approvalReference: z.string().nullable(),
});

const apiErrorSchema = z.object({ code: z.string(), message: z.string(), field: z.string().optional() });

export const dashboardProcedureApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: dashboardProcedureResponseSchema.nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export const dashboardProcedureListApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(dashboardProcedureResponseSchema).nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export type CreateDashboardProcedureDto = z.infer<typeof createDashboardProcedureSchema>;
export type UpdateDashboardProcedureDto = z.infer<typeof updateDashboardProcedureSchema>;
export type DashboardProcedureResponseDto = z.infer<typeof dashboardProcedureResponseSchema>;