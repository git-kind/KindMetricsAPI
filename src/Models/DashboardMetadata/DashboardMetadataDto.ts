import { z } from 'zod';

const procedureName = z.string().regex(/^sp_dash_[a-zA-Z0-9_]{1,112}$/);
const dataType = z.enum(['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME']);

const apiErrorSchema = z.object({ code: z.string(), message: z.string(), field: z.string().optional() });

export const dashboardSchemaQuerySchema = z
  .object({
    tableName: z
      .string()
      .regex(/^[a-zA-Z0-9_$]{1,64}$/)
      .optional(),
  })
  .strict();

export const dashboardMetadataApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z
    .object({
      tables: z.array(
        z.object({
          name: z.string(),
          type: z.enum(['BASE TABLE', 'VIEW']),
          engine: z.string().nullable(),
          comment: z.string(),
        }),
      ),
      columns: z.array(
        z.object({
          tableName: z.string(),
          name: z.string(),
          ordinalPosition: z.number().int().positive(),
          dataType: z.string(),
          columnType: z.string(),
          nullable: z.boolean(),
          defaultValue: z.unknown().nullable(),
          primaryKey: z.boolean(),
        }),
      ),
      indexes: z.array(
        z.object({
          tableName: z.string(),
          name: z.string(),
          columnName: z.string(),
          sequence: z.number().int().positive(),
          unique: z.boolean(),
        }),
      ),
      relationships: z.array(
        z.object({
          tableName: z.string(),
          columnName: z.string(),
          constraintName: z.string(),
          referencedTable: z.string(),
          referencedColumn: z.string(),
        }),
      ),
    })
    .nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export const dashboardProcedureDiscoveryResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z
    .array(
      z.object({
        procedureName,
        securityType: z.enum(['DEFINER', 'INVOKER']),
        executable: z.boolean(),
        parameters: z.array(
          z.object({
            name: z.string(),
            type: dataType,
            mysqlType: z.string(),
            mode: z.enum(['IN', 'OUT', 'INOUT']),
            ordinalPosition: z.number().int().nonnegative(),
          }),
        ),
      }),
    )
    .nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export const validateDashboardProcedureSchema = z
  .object({
    procedureName,
    parametersSchema: z
      .object({
        schemaVersion: z.literal(1),
        parameters: z
          .array(
            z
              .object({
                name: z.string().regex(/^p_[a-z][a-z0-9_]{0,62}$/),
                type: dataType,
                required: z.boolean(),
              })
              .strict(),
          )
          .max(64),
      })
      .strict()
      .refine((schema) => new Set(schema.parameters.map((parameter) => parameter.name)).size === schema.parameters.length, {
        message: 'Los nombres de parámetros deben ser únicos.',
      })
      .optional(),
  })
  .strict();

export const dashboardProcedureValidationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z
    .object({
      valid: z.boolean(),
      procedureName,
      securityType: z.enum(['DEFINER', 'INVOKER']).nullable(),
      parameters: z.array(
        z.object({
          name: z.string(),
          type: dataType,
          mysqlType: z.string(),
          mode: z.enum(['IN', 'OUT', 'INOUT']),
          ordinalPosition: z.number().int().nonnegative(),
        }),
      ),
      errors: z.array(z.string()),
    })
    .nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

const previewValue = z.union([z.string().max(10_000), z.number().finite(), z.boolean(), z.null()]);

export const dashboardProcedurePreviewSchema = z
  .object({
    procedureName,
    parameters: z.record(z.string().regex(/^p_[a-z][a-z0-9_]{0,62}$/), previewValue).default({}),
  })
  .strict();

export const dashboardProcedurePreviewResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z
    .object({
      kind: z.literal('KindMetricsDataFrame'),
      version: z.literal(1),
      columns: z.array(z.object({ name: z.string(), type: dataType })),
      rows: z.array(z.record(z.string(), z.unknown())),
      rowCount: z.number().int().nonnegative(),
      executionTimeMs: z.number().int().nonnegative(),
      executedAt: z.string().datetime(),
    })
    .nullable(),
  errors: z.array(apiErrorSchema),
  meta: z.object({ requestId: z.string() }),
});

export type DashboardSchemaQueryDto = z.infer<typeof dashboardSchemaQuerySchema>;
export type ValidateDashboardProcedureDto = z.infer<typeof validateDashboardProcedureSchema>;
export type DashboardProcedurePreviewDto = z.infer<typeof dashboardProcedurePreviewSchema>;
