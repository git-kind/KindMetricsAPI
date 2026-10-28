import { z } from 'zod';

const guid = z.string().uuid();
const tabName = z.string().trim().min(1).max(150);
const expectedVersion = z.number().int().positive().max(4_294_967_295).safe();

export const dashboardTabParamsSchema = z.object({
  dashboardGuid: guid,
  tabGuid: guid.optional(),
});

export const dashboardTabGuidParamsSchema = z.object({
  dashboardGuid: guid,
  tabGuid: guid,
});

export const dashboardTabListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createDashboardTabSchema = z
  .object({
    name: tabName,
    description: z.string().max(20_000).nullable().optional(),
  })
  .strict();

export const updateDashboardTabSchema = z
  .object({
    name: tabName.optional(),
    description: z.string().max(20_000).nullable().optional(),
    expectedVersion,
  })
  .strict()
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: 'Debe proporcionar al menos una propiedad para actualizar.',
  });

export const duplicateDashboardTabSchema = z
  .object({
    name: tabName.optional(),
    includePanels: z.boolean().default(false),
  })
  .strict()
  .default({ includePanels: false });

export const reorderDashboardTabsSchema = z
  .object({
    tabs: z
      .array(z.object({ guid, sortOrder: z.number().int().nonnegative().max(4_294_967_295) }).strict())
      .min(1)
      .max(500),
  })
  .strict()
  .refine((value) => new Set(value.tabs.map((tab) => tab.guid)).size === value.tabs.length, {
    message: 'La lista contiene GUIDs duplicados.',
  });

export const setDefaultDashboardTabSchema = z.object({}).strict().default({});

export const setDashboardTabStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE']),
    expectedVersion,
  })
  .strict();

export const dashboardTabResponseSchema = z.object({
  id: z.number().int().positive().safe(),
  guid,
  dashboardId: z.number().int().positive().safe(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int().nonnegative().safe(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  isDefault: z.boolean(),
  version: z.number().int().positive().safe(),
  createdAt: z.string().datetime(),
  createdBy: z.number().int().positive().safe(),
  updatedAt: z.string().datetime().nullable(),
  updatedBy: z.number().int().positive().safe().nullable(),
  panelCount: z.number().int().nonnegative().safe().optional(),
});

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
});

export const dashboardTabApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: dashboardTabResponseSchema.nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export const dashboardTabListApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(dashboardTabResponseSchema).nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export type CreateDashboardTabDto = z.infer<typeof createDashboardTabSchema>;
export type UpdateDashboardTabDto = z.infer<typeof updateDashboardTabSchema>;
export type DuplicateDashboardTabDto = z.infer<typeof duplicateDashboardTabSchema>;
export type ReorderDashboardTabsDto = z.infer<typeof reorderDashboardTabsSchema>;
export type SetDashboardTabStatusDto = z.infer<typeof setDashboardTabStatusSchema>;
export type DashboardTabResponseDto = z.infer<typeof dashboardTabResponseSchema>;
