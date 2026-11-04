import { describe, expect, it } from 'vitest';
import { buildSuccessResponse } from '../src/Helpers/ResponseHelper.js';
import {
  companyApiResponseSchema,
  createCompanySchema,
  provisionCompanyDatabaseSchema,
} from '../src/Models/Companies/CompanyManagementDto.js';

describe('company management response schema', () => {
  it('keeps company registration separate from database credentials', () => {
    const company = {
      name: 'Empresa',
      code: 'EMP',
      razon_social: 'Empresa S.A.',
    };

    expect(createCompanySchema.safeParse(company).success).toBe(true);
    expect(createCompanySchema.safeParse({
      ...company,
      database_name: 'empresa_01',
      database_user: 'empresa_user',
      database_password: 'a-secure-password',
    }).success).toBe(false);
  });

  it('validates database and account constraints on the provisioning contract', () => {
    const database = {
      database_name: 'empresa_01',
      database_user: 'empresa_user',
      database_password: 'a-secure-password',
    };

    expect(provisionCompanyDatabaseSchema.safeParse(database).success).toBe(true);
    expect(provisionCompanyDatabaseSchema.safeParse({
      ...database,
      database_name: 'nombre-con-caracter-invalido!',
    }).success).toBe(false);
    expect(provisionCompanyDatabaseSchema.safeParse({
      ...database,
      database_name: 'd'.repeat(65),
    }).success).toBe(false);
    expect(provisionCompanyDatabaseSchema.safeParse({
      ...database,
      database_user: 'u'.repeat(33),
    }).success).toBe(false);
  });

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

  it('rejects database credentials in the registration contract', () => {
    const company = {
      name: 'Empresa',
      code: 'EMP',
      razon_social: 'Empresa S.A.',
      database_name: 'empresa_01',
      database_user: 'empresa_user',
      database_password: 'a-secure-password',
    };

    expect(createCompanySchema.safeParse(company).success).toBe(false);
  });

  it('returns the created company without exposing database credentials', () => {
    const response = buildSuccessResponse(
      {
        id: 1,
        guid: 'c7d4a114-40f8-4a19-90f2-8ad590baf3a9',
        name: 'Empresa',
        code: 'EMP',
        razon_social: 'Empresa S.A.',
        rfc: null,
        direccion: null,
        telefono: null,
        created_at: '2026-10-22T00:00:00.000Z',
        estado: 'activo' as const,
      },
      'req-company',
      'Base de datos aprovisionada correctamente.',
    );

    expect(companyApiResponseSchema.safeParse(response).success).toBe(true);
    expect(response.data).not.toHaveProperty('database_password');
    expect(response.data).not.toHaveProperty('db_password_encrypted');
  });
});
