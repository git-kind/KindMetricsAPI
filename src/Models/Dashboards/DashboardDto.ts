import { z } from 'zod';
import type { ApiResponse } from '../ApiResponse.js';

const dashboardStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const dashboardGuidParamsSchema = z.object({
  guid: z.string().uuid(),
});

export const createDashboardSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).nullable().optional(),
    folderId: z.number().int().positive().safe().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  })
  .strict();

export const updateDashboardSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(20_000).nullable().optional(),
    folderId: z.number().int().positive().safe().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    expectedVersion: z.number().int().positive().max(4_294_967_295).safe(),
  })
  .strict()
  .refine((payload) => Object.keys(payload).some((key) => key !== 'expectedVersion'), {
    message: 'Debe proporcionar al menos una propiedad para actualizar.',
  });

export const dashboardFiltersSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    folderId: z.coerce.number().int().positive().safe().optional(),
    status: dashboardStatusSchema.optional(),
    tags: z
      .union([
        z
          .string()
          .max(5_049)
          .transform((value) => value.split(',').map((tag) => tag.trim()))
          .pipe(z.array(z.string().min(1).max(100)).max(50)),
        z.array(z.string().trim().min(1).max(100)).max(50),
      ])
      .optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'status']).default('updatedAt'),
    sortDirection: z.enum(['ASC', 'DESC']).default('DESC'),
  })
  .strict();

export const dashboardStatusRequestSchema = z
  .object({
    status: dashboardStatusSchema,
    expectedVersion: z.number().int().positive().max(4_294_967_295).safe(),
  })
  .strict();

export const duplicateDashboardSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    includePanels: z.boolean().default(false),
  })
  .strict()
  .default({ includePanels: false });

export const dashboardResponseSchema = z.object({
  id: z.number().int().positive().safe(),
  guid: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  folderId: z.number().int().positive().safe().nullable(),
  tags: z.array(z.string()),
  status: dashboardStatusSchema,
  version: z.number().int().positive().safe(),
  createdAt: z.string().datetime(),
  createdBy: z.number().int().positive().safe(),
  updatedAt: z.string().datetime().nullable(),
  updatedBy: z.number().int().positive().safe().nullable(),
});

export type CreateDashboardDto = z.infer<typeof createDashboardSchema>;
export type UpdateDashboardDto = z.infer<typeof updateDashboardSchema>;
export type DashboardFiltersDto = z.infer<typeof dashboardFiltersSchema>;
export type DashboardStatusDto = z.infer<typeof dashboardStatusRequestSchema>;
export type DuplicateDashboardDto = z.infer<typeof duplicateDashboardSchema>;
export type DashboardResponseDto = z.infer<typeof dashboardResponseSchema>;
export type DashboardApiResponseDto<T> = ApiResponse<T>;

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
});

export const dashboardApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: dashboardResponseSchema.nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export const dashboardListApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(dashboardResponseSchema).nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({
    requestId: z.string(),
    pagination: z
      .object({
        page: z.number(),
        pageSize: z.number(),
        total: z.number(),
        totalPages: z.number(),
      })
      .optional(),
  }),
});
