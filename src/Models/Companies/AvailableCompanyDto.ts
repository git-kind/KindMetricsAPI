import { z } from 'zod';

const availableCompanySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  code: z.string(),
});

export type AvailableCompanyDto = z.infer<typeof availableCompanySchema>;

export const availableCompaniesApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(availableCompanySchema).nullable(),
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    }),
  ),
  meta: z.object({ requestId: z.string() }),
});
