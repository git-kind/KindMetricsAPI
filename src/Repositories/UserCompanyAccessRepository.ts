import { AppError } from '../Errors/AppError.js';
import type {
  UserCompanyAccessCompanyDto,
  UserCompanyAccessUserDto,
} from '../Models/Companies/UserCompanyAccessDto.js';
import { callRows } from './StoredProcedures/ProcedureExecutor.js';

type UserRow = {
  id: number;
  guid: string;
  name: string;
  email: string;
  perfil: 'Admin' | 'Visor';
  companyIds: number[] | string | null;
};

export interface UserCompanyAccessListDto {
  users: UserCompanyAccessUserDto[];
  companies: UserCompanyAccessCompanyDto[];
}

function parseCompanyIds(value: UserRow['companyIds']): number[] {
  if (Array.isArray(value)) {
    return value
      .map(Number)
      .filter((companyId) => Number.isSafeInteger(companyId) && companyId > 0);
  }
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  const parsed: unknown = value.startsWith('[')
    ? JSON.parse(value)
    : value.split(',').map(Number);
  if (!Array.isArray(parsed)) {
    throw new Error('El procedimiento devolvió una lista de empresas inválida.');
  }
  return parsed.filter(
    (companyId): companyId is number =>
      typeof companyId === 'number' &&
      Number.isSafeInteger(companyId) &&
      companyId > 0,
  );
}

function mapUser(row: UserRow): UserCompanyAccessUserDto {
  return {
    guid: row.guid,
    name: row.name,
    email: row.email,
    perfil: row.perfil,
    companyIds: parseCompanyIds(row.companyIds),
  };
}

export async function listUserCompanyAccess(): Promise<UserCompanyAccessListDto> {
  const [users, companies] = await Promise.all([
    callRows<UserRow>('sp_user_company_access_users', []),
    callRows<UserCompanyAccessCompanyDto>(
      'sp_user_company_access_companies',
      [],
    ),
  ]);

  return {
    users: users.map(mapUser),
    companies,
  };
}

export async function replaceUserCompanyAccess(
  userGuid: string,
  companyIds: number[],
): Promise<UserCompanyAccessUserDto | undefined> {
  try {
    const [user] = await callRows<UserRow>(
      'sp_user_company_access_replace',
      [userGuid, JSON.stringify([...new Set(companyIds)])],
    );
    return user ? mapUser(user) : undefined;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ER_SIGNAL_EXCEPTION' &&
      'sqlMessage' in error &&
      typeof error.sqlMessage === 'string' &&
      error.sqlMessage.startsWith('INVALID_COMPANY_ASSIGNMENT:')
    ) {
      throw new AppError(
        'Una o más empresas no existen o están inactivas.',
        {
          statusCode: 400,
          code: 'INVALID_COMPANY_ASSIGNMENT',
          field: 'companyIds',
        },
      );
    }
    throw error;
  }
}
