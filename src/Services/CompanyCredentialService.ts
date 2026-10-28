import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../Errors/AppError.js';

const formatVersion = 1;
const ivLength = 12;
const authenticationTagLength = 16;
const headerLength = 1 + ivLength + authenticationTagLength;
const maximumStoredLength = 512;

export class CompanyCredentialService {
  constructor(private readonly encodedKey = process.env.COMPANY_DB_ENCRYPTION_KEY) {}

  encrypt(password: string): Buffer {
    if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > maximumStoredLength - headerLength) {
      throw new AppError('La contraseña de conexión no puede almacenarse en el formato configurado.', {
        statusCode: 422,
        code: 'COMPANY_CREDENTIAL_TOO_LONG',
      });
    }

    const iv = randomBytes(ivLength);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([formatVersion]), iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(encrypted: Buffer): string {
    if (!Buffer.isBuffer(encrypted) || encrypted.length < headerLength || encrypted.length > maximumStoredLength) {
      throw new AppError('La credencial de conexión almacenada no tiene un formato válido.', {
        statusCode: 503,
        code: 'COMPANY_CREDENTIAL_INVALID',
      });
    }
    if (encrypted[0] !== formatVersion) {
      throw new AppError('La versión de la credencial de conexión no es compatible.', {
        statusCode: 503,
        code: 'COMPANY_CREDENTIAL_VERSION_UNSUPPORTED',
      });
    }

    const iv = encrypted.subarray(1, 1 + ivLength);
    const authenticationTag = encrypted.subarray(1 + ivLength, headerLength);
    const ciphertext = encrypted.subarray(headerLength);
    const key = this.getKey();
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authenticationTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new AppError('No fue posible validar la integridad de la credencial de conexión.', {
        statusCode: 503,
        code: 'COMPANY_CREDENTIAL_INTEGRITY_FAILED',
      });
    }
  }

  private getKey(): Buffer {
    const encodedKey = this.encodedKey;
    if (
      !encodedKey ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedKey)
    ) {
      throw new AppError('COMPANY_DB_ENCRYPTION_KEY debe ser una clave Base64 válida de 32 bytes.', {
        statusCode: 503,
        code: 'COMPANY_ENCRYPTION_KEY_INVALID',
      });
    }
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encodedKey) {
      throw new AppError('COMPANY_DB_ENCRYPTION_KEY debe ser una clave Base64 válida de 32 bytes.', {
        statusCode: 503,
        code: 'COMPANY_ENCRYPTION_KEY_INVALID',
      });
    }
    return key;
  }
}

export const companyCredentialService = new CompanyCredentialService();
