import { describe, expect, it } from 'vitest';
import { buildErrorResponse, buildSuccessResponse } from '../src/Helpers/ResponseHelper.js';

describe('API response helper', () => {
  it('builds a successful response envelope', () => {
    const result = buildSuccessResponse({ ok: true }, 'req-123', 'Operación exitosa');

    expect(result).toMatchObject({
      success: true,
      message: 'Operación exitosa',
      data: { ok: true },
      errors: [],
      meta: { requestId: 'req-123' },
    });
  });

  it('builds a failed response envelope with multiple errors', () => {
    const result = buildErrorResponse('Hay errores de validación.', [
      { code: 'REQUIRED_FIELD', message: 'El correo es obligatorio.', field: 'email' },
      { code: 'REQUIRED_FIELD', message: 'La contraseña es obligatoria.', field: 'password' },
    ], 'req-456');

    expect(result).toMatchObject({
      success: false,
      message: 'Hay errores de validación.',
      data: null,
      errors: [
        { code: 'REQUIRED_FIELD', message: 'El correo es obligatorio.', field: 'email' },
        { code: 'REQUIRED_FIELD', message: 'La contraseña es obligatoria.', field: 'password' },
      ],
      meta: { requestId: 'req-456' },
    });
  });
});
