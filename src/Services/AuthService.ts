import argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { byEmail, byGuid } from '../Repositories/StoredProcedures/AuthRepository.js';
import { getPasswordRecoveryTokenByEmail, requestPasswordRecoveryToken, resetPasswordWithRecoveryToken } from '../Repositories/StoredProcedures/PasswordRecoveryRepository.js';
import { AppError } from '../Errors/AppError.js';

// IMPORTACIÓN CORRECTA DE TU FUNCIÓN DE ENVÍO DE CORREO
import { enviarCorreoRecuperacion } from './EmailService.js';

const otpTtlMinutes = 10;

function getPasswordRecoveryUrl(email: string): string {
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();
  const baseUrl =
    configuredBaseUrl ||
    (process.env.NODE_ENV === 'dev' ? 'http://localhost:9000' : undefined);

  if (!baseUrl) {
    throw new AppError('APP_BASE_URL debe configurarse para enviar el enlace de recuperación.', {
      statusCode: 503,
      code: 'RECOVERY_URL_NOT_CONFIGURED',
    });
  }

  let url: URL;
  try {
    url = new URL('/password-recovery', baseUrl);
  } catch (error) {
    throw new AppError('APP_BASE_URL debe ser una URL absoluta válida.', {
      statusCode: 500,
      code: 'RECOVERY_URL_INVALID',
      cause: error,
    });
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AppError('APP_BASE_URL debe usar HTTP o HTTPS y no incluir credenciales.', {
      statusCode: 500,
      code: 'RECOVERY_URL_INVALID',
    });
  }

  url.searchParams.set('email', email);
  return url.toString();
}

export class AuthService {
  async login(email: string, password: string) {
    const user = await byEmail(email.toLowerCase());
    const status = user?.status.trim().toUpperCase();
    if (!user || (status !== 'ACTIVE' && status !== 'ACTIVO') || !(await argon2.verify(user.password_hash, password))) return null;
    return { sub: user.guid, platformAdmin: Boolean(user.is_platform_admin), email: user.email, name: user.name };
  }

  async refreshSession(guid: string) {
    const user = await byGuid(guid);
    const status = user?.status.trim().toUpperCase();
    if (!user || (status !== 'ACTIVE' && status !== 'ACTIVO')) return null;
    return {
      sub: user.guid,
      platformAdmin: Boolean(user.is_platform_admin),
      email: user.email,
      name: user.name,
    };
  }

  async me(guid: string) {
    const user = await byGuid(guid);
    return user ? { guid: user.guid, email: user.email, name: user.name, platformAdmin: Boolean(user.is_platform_admin) } : null;
  }

  async requestPasswordRecovery(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await byEmail(normalizedEmail);

    if (!user) {
      return {
        sent: false,
        email: normalizedEmail,
        expiresInMinutes: otpTtlMinutes,
        message: 'Si la cuenta existe, se enviará un código de validación.',
      };
    }

    const otp = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + otpTtlMinutes * 60_000).toISOString().slice(0, 19).replace('T', ' ');
    const otpHash = await argon2.hash(otp);
    const recoveryUrl = getPasswordRecoveryUrl(user.email);

    // Registra la sesión y expiración del OTP hasheado en la base de datos
    await requestPasswordRecoveryToken(user.id, otpHash, expiresAt);

    // PASO DE PARÁMETROS AJUSTADO: Le pasamos dirección, el código OTP y la URL dinámica con el query string (?email=...)
    await enviarCorreoRecuperacion(user.email, otp, recoveryUrl);

    return {
      sent: true,
      email: user.email,
      expiresInMinutes: otpTtlMinutes,
      message: 'Se envió un código de validación a tu correo.',
    };
  }

  async validatePasswordRecoveryToken(email: string, otp: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const token = await getPasswordRecoveryTokenByEmail(normalizedEmail);

    if (!token) return null;
    if (new Date(token.otp_expires_at).getTime() <= Date.now()) return null;
    if (!(await argon2.verify(token.otp_hash, otp))) return null;

    return {
      userId: token.user_id,
      tokenId: token.id,
      expiresAt: token.otp_expires_at,
      email: normalizedEmail,
    };
  }

  async updatePasswordWithRecovery(email: string, otp: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const token = await this.validatePasswordRecoveryToken(normalizedEmail, otp);

    if (!token) return false;

    const passwordHash = await argon2.hash(password);
    const result = await resetPasswordWithRecoveryToken(token.userId, token.tokenId, passwordHash);
    return Number(result[0]?.updated) === 1;
  }
}
