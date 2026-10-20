import { z } from 'zod';

export { loginRequestSchema, loginSchema } from './Auth/LoginRequestDto.js';
export { createUserRequestSchema, userCreateSchema } from './Users/CreateUserRequestDto.js';

export const guid = z.string().uuid();
export const entityCreateSchema = z.object({ name: z.string().min(1).max(160), description: z.string().max(2000).optional(), config: z.record(z.string(), z.unknown()).optional() }).strict();
export const entityUpdateSchema = entityCreateSchema.partial();
export const companyCreateSchema = entityCreateSchema.extend({ code: z.string().min(2).max(40), timezone: z.string().max(80).default('UTC'), locale: z.enum(['es','en']).default('es') });
export const querySchema = z.object({ datasourceGuid: guid, sql: z.string().min(1).max(50000), params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).default([]), maxRows: z.number().int().min(1).max(5000).default(1000) });
export type Principal = { sub: string; platformAdmin: boolean };
export type CompanyContext = { guid: string; id: number };
