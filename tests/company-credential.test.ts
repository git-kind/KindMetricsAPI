import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CompanyCredentialService } from '../src/Services/CompanyCredentialService.js';

describe('CompanyCredentialService', () => {
  it('encrypts credentials with a versioned authenticated format and decrypts them', () => {
    const service = new CompanyCredentialService(randomBytes(32).toString('base64'));
    const encrypted = service.encrypt('company-password');

    expect(encrypted[0]).toBe(1);
    expect(encrypted.length).toBe(29 + Buffer.byteLength('company-password'));
    expect(service.decrypt(encrypted)).toBe('company-password');
  });

  it('uses a fresh IV for each encryption', () => {
    const service = new CompanyCredentialService(randomBytes(32).toString('base64'));

    expect(service.encrypt('same-password').subarray(1, 13)).not.toEqual(
      service.encrypt('same-password').subarray(1, 13),
    );
  });

  it('rejects invalid key configuration', () => {
    expect(() => new CompanyCredentialService('not-base64').encrypt('secret')).toThrow(
      'COMPANY_DB_ENCRYPTION_KEY debe ser una clave Base64 válida de 32 bytes.',
    );
    expect(() => new CompanyCredentialService(Buffer.alloc(31).toString('base64')).encrypt('secret')).toThrow(
      'COMPANY_DB_ENCRYPTION_KEY debe ser una clave Base64 válida de 32 bytes.',
    );
  });

  it('rejects corrupt ciphertext and authentication tags without returning plaintext', () => {
    const service = new CompanyCredentialService(randomBytes(32).toString('base64'));
    const encrypted = service.encrypt('secret');
    encrypted[14] = encrypted[14]! ^ 1;

    expect(() => service.decrypt(encrypted)).toThrow('No fue posible validar la integridad');
    expect(() => service.decrypt(Buffer.alloc(4))).toThrow('no tiene un formato válido');
  });

  it('rejects ciphertext larger than the catalog field can store', () => {
    const service = new CompanyCredentialService(randomBytes(32).toString('base64'));

    expect(() => service.encrypt('x'.repeat(484))).toThrow('no puede almacenarse');
  });
});
