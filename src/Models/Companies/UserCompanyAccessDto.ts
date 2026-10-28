import { z } from 'zod';

export const userCompanyAccessParamsSchema = z.object({
  userGuid: z.string().uuid(),
});

export const updateUserCompanyAccessSchema = z
  .object({
    companyIds: z.array(z.number().int().positive().safe()).max(500),
  })
  .strict();

export interface UserCompanyAccessUserDto {
  guid: string;
  name: string;
  email: string;
  perfil: 'Admin' | 'Visor';
  companyIds: number[];
}

export interface UserCompanyAccessCompanyDto {
  id: number;
  name: string;
  code: string;
}

const assignmentUserSchema = z.object({
  guid: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  perfil: z.enum(['Admin', 'Visor']),
  companyIds: z.array(z.number().int().positive()),
});

const assignmentCompanySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  code: z.string(),
});

export const userCompanyAccessApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z
    .object({
      users: z.array(assignmentUserSchema),
      companies: z.array(assignmentCompanySchema),
    })
    .nullable(),
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    }),
  ),
  meta: z.object({ requestId: z.string() }),
});

export const userCompanyAccessUpdateApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: assignmentUserSchema.nullable(),
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    }),
  ),
  meta: z.object({ requestId: z.string() }),
});
