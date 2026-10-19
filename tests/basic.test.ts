import { describe, it, expect } from 'vitest';
import { companyCreateSchema } from '../src/Models/Common.js';
describe('DTOs', () => { it('rejects empty company name', () => { expect(companyCreateSchema.safeParse({ name: '', code: 'AA' }).success).toBe(false); }); });
