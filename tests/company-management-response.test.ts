import { describe, expect, it } from 'vitest';
import { buildSuccessResponse } from '../src/Helpers/ResponseHelper.js';
import { companyApiResponseSchema } from '../src/Models/Companies/CompanyManagementDto.js';

describe('company management response schema', () => {
  it('accepts legacy companies with nullable optional contact fields', () => {
    const response = buildSuccessResponse(
      [
        {
          id: 1,
          guid: 'c7d4a114-40f8-4a19-90f2-8ad590baf3a9',
          name: 'Empresa heredada',
          code: 'LEGACY',
          razon_social: 'Empresa heredada S.A.',
          rfc: null,
          direccion: null,
          telefono: null,
          created_at: '2026-10-22T00:00:00.000Z',
          estado: 'activo' as const,
        },
      ],
      'req-company',
      'Empresas obtenidas correctamente.',
    );

    expect(companyApiResponseSchema.safeParse(response).success).toBe(true);
  });
});
