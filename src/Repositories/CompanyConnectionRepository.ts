import type { RowDataPacket } from 'mysql2';
import type { CompanyContext } from '../Models/Common.js';
import { callRows } from './StoredProcedures/ProcedureExecutor.js';

type CompanyConnectionRow = RowDataPacket & {
  db_name: string | null;
  db_username: string | null;
  db_password_encrypted: Buffer | null;
};

export async function getCompanyConnectionCredentials(
  company: CompanyContext,
): Promise<CompanyConnectionRow | undefined> {
  const [credentials] = await callRows<CompanyConnectionRow>('sp_company_connection_get', [
    company.id,
    company.guid,
  ]);
  return credentials;
}
