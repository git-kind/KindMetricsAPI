import { callRows } from './ProcedureExecutor.js';

export type PasswordRecoveryTokenRow = {
  id: number;
  user_id: number;
  otp_hash: string;
  otp_expires_at: string;
  used_at: string | null;
};

export async function requestPasswordRecoveryToken(userId: number, otpHash: string, expiresAt: string) {
  return callRows('sp_password_recovery_request', [userId, otpHash, expiresAt]);
}

export async function getPasswordRecoveryTokenByEmail(email: string): Promise<PasswordRecoveryTokenRow | undefined> {
  const rows = await callRows<PasswordRecoveryTokenRow>('sp_password_recovery_validate', [email]);
  return rows[0];
}

export async function resetPasswordWithRecoveryToken(userId: number, tokenId: number, passwordHash: string) {
  return callRows<{ updated: number }>('sp_password_recovery_reset', [userId, tokenId, passwordHash]);
}
