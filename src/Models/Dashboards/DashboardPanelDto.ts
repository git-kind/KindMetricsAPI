import { z } from 'zod';

const guid = z.string().uuid();
const expectedVersion = z.number().int().positive().max(4_294_967_295).safe();
const panelTypes = ['NUMBER', 'TABLE', 'LINE', 'BAR', 'PIE', 'GAUGE', 'HEATMAP', 'MAP', 'TEXT', 'STAT'] as const;
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

const procedureParameterSchema = z
  .object({
    name: z.string().regex(/^p_[a-z][a-z0-9_]{0,62}$/),
    type: z.enum(['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME']),
    source: z.enum(['DASHBOARD_FILTER', 'STATIC', 'SYSTEM']),
    filter: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).optional(),
    value: z.union([z.string().max(2_000), z.number().finite(), z.boolean(), z.null()]).optional(),
    systemKey: z.enum(['companyGuid', 'companyId', 'userGuid']).optional(),
    required: z.boolean(),
  })
  .strict()
  .superRefine((parameter, context) => {
    if (parameter.source === 'DASHBOARD_FILTER' && !parameter.filter) {
      context.addIssue({ code: 'custom', path: ['filter'], message: 'El parámetro requiere un filtro de Dashboard.' });
    }
    if (parameter.source === 'STATIC' && parameter.value === undefined) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'El parámetro STATIC requiere un valor fijo.' });
    }
    if (parameter.source === 'SYSTEM' && !parameter.systemKey) {
      context.addIssue({ code: 'custom', path: ['systemKey'], message: 'El parámetro SYSTEM requiere una clave de contexto.' });
    }
    if (parameter.source !== 'DASHBOARD_FILTER' && parameter.filter !== undefined) {
      context.addIssue({ code: 'custom', path: ['filter'], message: 'Solo DASHBOARD_FILTER admite mapeo de filtro.' });
    }
    if (parameter.source !== 'STATIC' && parameter.value !== undefined) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'Solo STATIC admite un valor configurado.' });
    }
    if (parameter.source !== 'SYSTEM' && parameter.systemKey !== undefined) {
      context.addIssue({ code: 'custom', path: ['systemKey'], message: 'Solo SYSTEM admite claves de contexto.' });
    }
  });

const procedureParamsSchema = z
  .object({ schemaVersion: z.literal(1), parameters: z.array(procedureParameterSchema).max(64) })
  .strict()
  .refine((value) => new Set(value.parameters.map((parameter) => parameter.name)).size === value.parameters.length, {
    message: 'Los nombres de parámetros del procedimiento deben ser únicos.',
  });

const fieldName = z.string().trim().min(1).max(128);
const color = z.string().trim().min(1).max(40);
const thresholdSchema = z.object({ value: z.number().finite(), color }).strict();
const visualizationPropertiesSchemas = {
  NUMBER: z.object({
    valueField: fieldName,
    title: z.string().max(200).optional(),
    unit: z.string().max(40).optional(),
    decimals: z.number().int().min(0).max(10).optional(),
    prefix: z.string().max(32).optional(),
    suffix: z.string().max(32).optional(),
    format: z.enum(['number', 'currency', 'percent', 'duration']).optional(),
    thresholds: z.array(thresholdSchema).max(32).optional(),
    colors: z.array(color).max(32).optional(),
  }).strict(),
  STAT: z.object({ valueField: fieldName }).passthrough(),
  TABLE: z.object({
    columns: z.array(z.object({
      field: fieldName,
      header: z.string().max(200).optional(),
      format: z.enum(['text', 'number', 'date', 'datetime', 'percent']).optional(),
      align: z.enum(['left', 'center', 'right']).optional(),
      visible: z.boolean().optional(),
    }).strict()).min(1).max(256),
    pagination: z.object({ enabled: z.boolean(), pageSize: z.number().int().min(1).max(500) }).strict().optional(),
    sorting: z.object({ enabled: z.boolean(), fields: z.array(fieldName).max(256) }).strict().optional(),
  }).strict(),
  LINE: z.object({
    xField: fieldName,
    yFields: z.array(fieldName).min(1).max(32),
    series: z.array(z.object({ field: fieldName, name: z.string().max(100).optional(), color: color.optional(), unit: z.string().max(40).optional() }).strict()).max(32).optional(),
    legend: z.boolean().optional(),
    xAxisFormat: z.string().max(40).optional(),
    yAxisFormat: z.string().max(40).optional(),
    labels: z.boolean().optional(),
    colors: z.array(color).max(32).optional(),
  }).strict(),
  BAR: z.object({
    xField: fieldName,
    yFields: z.array(fieldName).min(1).max(32),
    series: z.array(z.object({ field: fieldName, name: z.string().max(100).optional(), color: color.optional(), unit: z.string().max(40).optional() }).strict()).max(32).optional(),
    legend: z.boolean().optional(),
    xAxisFormat: z.string().max(40).optional(),
    yAxisFormat: z.string().max(40).optional(),
    labels: z.boolean().optional(),
    colors: z.array(color).max(32).optional(),
    stacked: z.boolean().optional(),
  }).strict(),
  PIE: z.object({
    categoryField: fieldName,
    valueField: fieldName,
    legend: z.boolean().optional(),
    labels: z.boolean().optional(),
    showPercentages: z.boolean().optional(),
    colors: z.array(color).max(64).optional(),
  }).strict(),
  GAUGE: z.object({
    valueField: fieldName,
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
    unit: z.string().max(40).optional(),
    thresholds: z.array(thresholdSchema).max(32).optional(),
  }).strict().refine((properties) => properties.minimum === undefined || properties.maximum === undefined || properties.minimum < properties.maximum),
  HEATMAP: z.object({
    xField: fieldName,
    yField: fieldName,
    valueField: fieldName,
    colorScale: z.array(color).min(2).max(16).optional(),
  }).strict(),
  MAP: z.object({
    latitudeField: fieldName,
    longitudeField: fieldName,
    labelField: fieldName.optional(),
    valueField: fieldName.optional(),
    marker: z.object({ color: color.optional(), size: z.number().int().min(1).max(64).optional(), cluster: z.boolean().optional() }).strict().optional(),
  }).strict(),
  TEXT: z.object({ content: z.string().max(20_000).refine((value) => !/[<>]/.test(value)), format: z.literal('plain').default('plain') }).strict(),
} as const;

export function validPanelVisualizationConfig(panelType: (typeof panelTypes)[number], config: z.infer<typeof configSchema> | null | undefined): boolean {
  if (config == null) return false;
  return visualizationPropertiesSchemas[panelType].safeParse(config.properties).success;
}

const procedureAssociationSchema = (panel: { panelType: (typeof panelTypes)[number]; dashboardProcedureGuid?: string | null; procedureParams?: unknown }) => {
  if (panel.panelType === 'TEXT') return true;
  return Boolean(panel.dashboardProcedureGuid) && procedureParamsSchema.safeParse(panel.procedureParams).success;
};

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

export const executeDashboardPanelSchema = z
  .object({
    filters: z.record(
      z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
      z.union([z.string().max(2_000), z.number().finite(), z.boolean(), z.null()]),
    ).default({}),
  })
  .strict()
  .refine((request) => Object.keys(request.filters).length <= 64 && JSON.stringify(request.filters).length <= 32_768, {
    message: 'La cantidad o tamaño de los filtros excede el límite permitido.',
    path: ['filters'],
  });

export const dashboardPanelExecutionResponseSchema = z.object({
  panelGuid: guid,
  panelType: z.enum(panelTypes),
  columns: z.array(z.object({ name: z.string(), type: z.string() }).strict()),
  rows: z.array(z.record(z.string(), z.unknown())),
  rowCount: z.number().int().nonnegative(),
  executionTimeMs: z.number().int().nonnegative(),
  executedAt: z.string().datetime(),
});

export const dashboardPanelExecutionApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: dashboardPanelExecutionResponseSchema.nullable(),
  errors: z.array(z.object({ code: z.string(), message: z.string(), field: z.string().optional() })),
  meta: z.object({ requestId: z.string() }),
});

export const createDashboardPanelSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).nullable().optional(),
    panelType: z.enum(panelTypes),
    dashboardProcedureGuid: guid.nullable().optional(),
    procedureParams: procedureParamsSchema.optional(),
    executionTimeoutSeconds: z.number().int().min(1).max(300).default(30),
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
  )
  .refine(procedureAssociationSchema, {
    path: ['dashboardProcedureGuid'],
    message: 'Los Paneles que ejecutan datos requieren un procedimiento autorizado y su definición de parámetros.',
  })
  .refine((panel) => validPanelVisualizationConfig(panel.panelType, panel.visualizationConfig), {
    path: ['visualizationConfig'],
    message: 'La configuración de visualización no corresponde al tipo de Panel.',
  });

export const updateDashboardPanelSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(20_000).nullable().optional(),
    panelType: z.enum(panelTypes).optional(),
    dashboardProcedureGuid: guid.nullable().optional(),
    procedureParams: procedureParamsSchema.nullable().optional(),
    executionTimeoutSeconds: z.number().int().min(1).max(300).optional(),
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
  })
  .refine(
    (panel) =>
      panel.panelType === undefined ||
      panel.panelType === 'TEXT' ||
      panel.dashboardProcedureGuid === undefined || (panel.dashboardProcedureGuid !== null && panel.procedureParams != null),
    {
      path: ['dashboardProcedureGuid'],
      message: 'Al cambiar a un Panel con datos se requiere un procedimiento autorizado y su definición de parámetros.',
    },
  )
  .refine(
    (panel) => panel.panelType === undefined || panel.visualizationConfig === undefined || validPanelVisualizationConfig(panel.panelType, panel.visualizationConfig),
    {
      path: ['visualizationConfig'],
      message: 'La configuración de visualización no corresponde al tipo de Panel.',
    },
  );

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
  dashboardProcedureGuid: guid.nullable(),
  procedureParams: procedureParamsSchema.nullable(),
  executionTimeoutSeconds: z.number().int().positive().max(300),
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
