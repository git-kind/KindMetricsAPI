import { z } from 'zod';

const guid = z.string().uuid();
const expectedVersion = z.number().int().positive().max(4_294_967_295).safe();
const panelTypes = ['LINE', 'BAR', 'PIE', 'GAUGE', 'STAT', 'TABLE', 'HEATMAP', 'TEXT'] as const;
const secretKey = /password|passwd|secret|token|credential|private.?key|api.?key/i;

function validConfig(value: unknown): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  if (serialized.length > 32_768) return false;
  const visit = (item: unknown, depth: number): boolean => {
    if (depth > 8) return false;
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (Array.isArray(item)) return item.length <= 500 && item.every((child) => visit(child, depth + 1));
    if (typeof item !== 'object') return false;
    return Object.entries(item).every(([key, child]) => !secretKey.test(key) && visit(child, depth + 1));
  };
  return visit(value, 0);
}

const configSchema = z
  .object({
    schemaVersion: z.literal(1),
    properties: z.record(z.string().max(100), z.unknown()),
  })
  .strict()
  .refine(validConfig, {
    message: 'La configuración excede los límites o contiene una propiedad sensible.',
  });

const gridSchema = z
  .object({
    gridX: z.number().int().min(0).max(12),
    gridY: z.number().int().min(0).max(100_000),
    gridW: z.number().int().min(1).max(12),
    gridH: z.number().int().min(1).max(100_000),
  })
  .strict()
  .refine((grid) => grid.gridX + grid.gridW <= 12, {
    message: 'El panel excede el ancho de 12 columnas.',
  });

export const dashboardPanelParamsSchema = z.object({
  dashboardGuid: guid,
  tabGuid: guid,
  panelGuid: guid.optional(),
});

export const dashboardPanelGuidParamsSchema = z.object({
  dashboardGuid: guid,
  tabGuid: guid,
  panelGuid: guid,
});

export const dashboardPanelListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  panelType: z.enum(panelTypes).optional(),
});

export const createDashboardPanelSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).nullable().optional(),
    panelType: z.enum(panelTypes),
    ...gridSchema.shape,
    minW: z.number().int().min(1).max(12).default(2),
    minH: z.number().int().min(1).max(100_000).default(2),
    maxW: z.number().int().min(1).max(12).nullable().optional(),
    maxH: z.number().int().min(1).max(100_000).nullable().optional(),
    sortOrder: z.number().int().nonnegative().max(4_294_967_295).default(0),
    isCollapsed: z.boolean().default(false),
    isLocked: z.boolean().default(false),
    isVisible: z.boolean().default(true),
    isResizable: z.boolean().default(true),
    isDraggable: z.boolean().default(true),
    visualizationConfig: configSchema.nullable().optional(),
    queryConfig: configSchema.nullable().optional(),
    displayConfig: configSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (panel) =>
      panel.gridX + panel.gridW <= 12 &&
      panel.gridW >= panel.minW &&
      panel.gridH >= panel.minH &&
      (panel.maxW == null || panel.gridW <= panel.maxW) &&
      (panel.maxH == null || panel.gridH <= panel.maxH),
    {
      message: 'Las dimensiones del panel no respetan sus límites min/max.',
    },
  );

export const updateDashboardPanelSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(20_000).nullable().optional(),
    panelType: z.enum(panelTypes).optional(),
    isCollapsed: z.boolean().optional(),
    isLocked: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    isResizable: z.boolean().optional(),
    isDraggable: z.boolean().optional(),
    visualizationConfig: configSchema.nullable().optional(),
    queryConfig: configSchema.nullable().optional(),
    displayConfig: configSchema.nullable().optional(),
    expectedVersion,
  })
  .strict()
  .refine((panel) => Object.keys(panel).some((key) => key !== 'expectedVersion'), {
    message: 'Debe proporcionar al menos una propiedad para actualizar.',
  });

export const duplicateDashboardPanelSchema = z.object({}).strict().default({});

export const moveDashboardPanelSchema = z
  .object({
    targetTabGuid: guid,
    gridX: z.number().int().min(0).max(11),
    gridY: z.number().int().min(0).max(100_000),
    expectedVersion,
  })
  .strict();

export const setDashboardPanelStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE']),
    expectedVersion,
  })
  .strict();

export const saveDashboardPanelLayoutSchema = z
  .object({
    panels: z
      .array(
        z
          .object({
            guid,
            ...gridSchema.shape,
            expectedVersion,
          })
          .strict(),
      )
      .max(500),
  })
  .strict()
  .refine((layout) => new Set(layout.panels.map((panel) => panel.guid)).size === layout.panels.length, {
    message: 'El layout contiene GUIDs duplicados.',
  })
  .refine((layout) => layout.panels.every((panel) => panel.gridX + panel.gridW <= 12), {
    message: 'Un panel excede el ancho de 12 columnas.',
  })
  .refine(
    (layout) =>
      layout.panels.every((a, index) =>
        layout.panels
          .slice(index + 1)
          .every((b) => a.gridX >= b.gridX + b.gridW || a.gridX + a.gridW <= b.gridX || a.gridY >= b.gridY + b.gridH || a.gridY + a.gridH <= b.gridY),
      ),
    {
      message: 'El layout contiene paneles superpuestos.',
    },
  );

export const dashboardPanelResponseSchema = z.object({
  id: z.number().int().positive().safe(),
  guid,
  tabId: z.number().int().positive().safe(),
  title: z.string(),
  description: z.string().nullable(),
  panelType: z.enum(panelTypes),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  gridX: z.number().int().nonnegative().safe(),
  gridY: z.number().int().nonnegative().safe(),
  gridW: z.number().int().positive().safe(),
  gridH: z.number().int().positive().safe(),
  minW: z.number().int().positive().safe(),
  minH: z.number().int().positive().safe(),
  maxW: z.number().int().positive().safe().nullable(),
  maxH: z.number().int().positive().safe().nullable(),
  sortOrder: z.number().int().nonnegative().safe(),
  isCollapsed: z.boolean(),
  isLocked: z.boolean(),
  isVisible: z.boolean(),
  isResizable: z.boolean(),
  isDraggable: z.boolean(),
  visualizationConfig: configSchema.nullable(),
  queryConfig: configSchema.nullable(),
  displayConfig: configSchema.nullable(),
  version: z.number().int().positive().safe(),
  createdAt: z.string().datetime(),
  createdBy: z.number().int().positive().safe(),
  updatedAt: z.string().datetime().nullable(),
  updatedBy: z.number().int().positive().safe().nullable(),
});

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
});

export const dashboardPanelApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: dashboardPanelResponseSchema.nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export const dashboardPanelListApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(dashboardPanelResponseSchema).nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export type CreateDashboardPanelDto = z.infer<typeof createDashboardPanelSchema>;
export type UpdateDashboardPanelDto = z.infer<typeof updateDashboardPanelSchema>;
export type MoveDashboardPanelDto = z.infer<typeof moveDashboardPanelSchema>;
export type DashboardPanelResponseDto = z.infer<typeof dashboardPanelResponseSchema>;
