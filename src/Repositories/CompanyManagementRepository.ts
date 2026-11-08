import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { AppError } from '../Errors/AppError.js';
import type { CompanyManagementDto } from '../Models/Companies/CompanyManagementDto.js';
import { companyCredentialService } from '../Services/CompanyCredentialService.js';
import { companyDatabaseInitializer } from '../Services/CompanyDatabaseInitializer.js';
import { callRows } from './StoredProcedures/ProcedureExecutor.js';

type CompanyRow = RowDataPacket & {
  id: number;
  guid: string;
  name: string;
  code: string;
  razon_social: string;
  rfc: string | null;
  direccion: string | null;
  telefono: string | null;
  created_at: Date | string | null;
  estado: 'activo' | 'inactivo' | null;
  status: string;
};

type CompanyProfileRow = RowDataPacket & {
  perfil: 'Admin' | 'Editor' | 'Visor';
};

type CompanyCodeRow = RowDataPacket & {
  id: number;
  guid: string;
  code: string;
  status: string;
};

type CompanyInput = {
  name: string;
  code: string;
  razon_social: string;
  rfc: string | null;
  direccion: string | null;
  telefono: string | null;
};

type CompanyDatabaseInput = {
  database_name: string;
  database_user: string;
  database_password: string;
};

type CompanyUpdateInput = Partial<CompanyInput> & {
  estado?: 'activo' | 'inactivo';
};

function toDto(row: CompanyRow): CompanyManagementDto {
  return {
    id: row.id,
    guid: row.guid,
    name: row.name,
    code: row.code,
    razon_social: row.razon_social,
    rfc: row.rfc,
    direccion: row.direccion,
    telefono: row.telefono,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    estado: row.estado?.toLowerCase() === 'inactivo' || row.status.toUpperCase() === 'INACTIVE'
      ? 'inactivo'
      : 'activo',
  };
}

function throwIfDuplicateCompanyCode(error: unknown): never {
  const code = error && typeof error === 'object' && 'code' in error
    ? error.code
    : undefined;
  const sqlMessage = error && typeof error === 'object' && 'sqlMessage' in error
    ? error.sqlMessage
    : undefined;

  if (code === 'ER_SP_WRONG_NO_OF_ARGS') {
    throw new AppError(
      'Los procedimientos de empresas están desactualizados. Aplica DataBaseScripts/0011-company-provisioning-procedure.sql y vuelve a intentar.',
      {
        statusCode: 503,
        code: 'COMPANY_PROCEDURE_MIGRATION_REQUIRED',
      },
    );
  }

  if (code === 'ER_DUP_ENTRY') {
    throw new AppError('Ya existe una empresa registrada con ese código.', {
      statusCode: 409,
      code: 'COMPANY_CODE_ALREADY_EXISTS',
      field: 'code',
    });
  }

  if (sqlMessage === 'COMPANY_NOT_FOUND') {
    throw new AppError('La empresa no existe.', {
      statusCode: 404,
      code: 'COMPANY_NOT_FOUND',
      field: 'id',
    });
  }

  if (sqlMessage === 'COMPANY_DATABASE_ALREADY_PROVISIONED') {
    throw new AppError('La empresa ya tiene una base de datos aprovisionada.', {
      statusCode: 409,
      code: 'COMPANY_DATABASE_ALREADY_PROVISIONED',
    });
  }

  if (sqlMessage === 'COMPANY_DATABASE_NOT_PROVISIONED') {
    throw new AppError('No se puede activar una empresa antes de aprovisionar su base de datos.', {
      statusCode: 409,
      code: 'COMPANY_DATABASE_NOT_PROVISIONED',
      field: 'estado',
    });
  }

  if (code === 'ER_DB_CREATE_EXISTS' || sqlMessage === 'COMPANY_DATABASE_ALREADY_EXISTS') {
    throw new AppError('Ya existe una base de datos con ese nombre.', {
      statusCode: 409,
      code: 'COMPANY_DATABASE_ALREADY_EXISTS',
      field: 'database_name',
    });
  }

  if (code === 'ER_USER_EXISTS' || code === 'ER_CANNOT_USER') {
    throw new AppError('Ya existe una cuenta MySQL con ese usuario y host.', {
      statusCode: 409,
      code: 'COMPANY_DATABASE_USER_ALREADY_EXISTS',
      field: 'database_user',
    });
  }

  if (sqlMessage === 'COMPANY_DATABASE_NAME_INVALID') {
    throw new AppError('El nombre de la base de datos no es válido.', {
      statusCode: 422,
      code: 'COMPANY_DATABASE_NAME_INVALID',
      field: 'database_name',
    });
  }

  if (sqlMessage === 'COMPANY_DATABASE_USER_INVALID') {
    throw new AppError('El usuario MySQL no es válido.', {
      statusCode: 422,
      code: 'COMPANY_DATABASE_USER_INVALID',
      field: 'database_user',
    });
  }

  if (sqlMessage === 'COMPANY_DATABASE_PASSWORD_REQUIRED') {
    throw new AppError('La contraseña de la base de datos es obligatoria.', {
      statusCode: 422,
      code: 'COMPANY_DATABASE_PASSWORD_REQUIRED',
      field: 'database_password',
    });
  }

  if (sqlMessage === 'COMPANY_DATABASE_USER_CONFLICTS_WITH_APPLICATION_USER') {
    throw new AppError('El usuario de la base de datos debe ser distinto al usuario de KindMetrics.', {
      statusCode: 422,
      code: 'COMPANY_DATABASE_USER_CONFLICTS_WITH_APPLICATION_USER',
      field: 'database_user',
    });
  }

  if (sqlMessage === 'COMPANY_APPLICATION_DATABASE_USER_INVALID') {
    throw new AppError('MYSQL_USER no tiene un nombre válido para conceder acceso a KindMetrics.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_CONFIGURATION_INVALID',
    });
  }

  if (
    code === 'ER_DBACCESS_DENIED_ERROR' ||
    code === 'ER_SPECIFIC_ACCESS_DENIED_ERROR' ||
    (error &&
      typeof error === 'object' &&
      'errno' in error &&
      (error.errno === 1044 || error.errno === 1227))
  ) {
    throw new AppError('El DEFINER del procedimiento no tiene permisos para aprovisionar la base de datos de la empresa.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_PROVISIONING_PERMISSION_DENIED',
    });
  }

  if (
    code === 'ER_CANT_CREATE_USER_WITH_GRANT' ||
    (error && typeof error === 'object' && 'errno' in error && error.errno === 1410)
  ) {
    throw new AppError('La cuenta de aplicación de KindMetrics no está configurada para recibir permisos sobre la base.', {
      statusCode: 503,
      code: 'COMPANY_APPLICATION_DATABASE_ACCOUNT_NOT_READY',
    });
  }

  throw error;
}

export async function listCompanies(): Promise<CompanyManagementDto[]> {
  const rows = await callRows<CompanyRow>('sp_company_management_list');
  return rows.map(toDto);
}

export async function getCompanyManagementUserProfile(
  guid: string,
): Promise<'Admin' | 'Editor' | 'Visor' | undefined> {
  const [row] = await callRows<CompanyProfileRow>('sp_company_management_user_profile', [guid]);
  return row?.perfil;
}

export async function resolveCompanyByCode(code: string) {
  try {
    const [row] = await callRows<CompanyCodeRow>('sp_company_management_get_by_code', [code]);
    return row;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ER_SP_DOES_NOT_EXIST'
    ) {
      throw new AppError(
        'El catálogo de empresas requiere actualizar sus procedimientos almacenados.',
        {
          statusCode: 503,
          code: 'COMPANY_CATALOG_MIGRATION_REQUIRED',
        },
      );
    }
    throw error;
  }
}

export async function getCompanyById(id: number): Promise<CompanyManagementDto | undefined> {
  const [row] = await callRows<CompanyRow>('sp_company_management_get_by_id', [id]);
  return row ? toDto(row) : undefined;
}

export async function createCompany(input: CompanyInput): Promise<CompanyManagementDto> {
  const payload = {
    name: input.name,
    code: input.code,
    razon_social: input.razon_social,
    rfc: input.rfc,
    direccion: input.direccion,
    telefono: input.telefono,
  };

  try {
    const [row] = await callRows<CompanyRow>('sp_company_management_create', [
      randomUUID(),
      JSON.stringify(payload),
    ]);
    if (!row) {
      throw new AppError('No se pudo recuperar la empresa recién registrada.', {
        code: 'COMPANY_CREATE_FAILED',
      });
    }
    return toDto(row);
  } catch (error) {
    return throwIfDuplicateCompanyCode(error);
  }
}

export async function provisionCompanyDatabase(
  companyId: number,
  input: CompanyDatabaseInput,
): Promise<CompanyManagementDto> {
  const applicationUser = process.env.MYSQL_USER?.trim();
  if (!applicationUser) {
    throw new AppError('MYSQL_USER no está configurado para conceder acceso a KindMetrics.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_CONFIGURATION_INVALID',
    });
  }
  if (applicationUser.length > 32) {
    throw new AppError('MYSQL_USER supera el límite permitido para una cuenta MySQL.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_CONFIGURATION_INVALID',
    });
  }
  if (applicationUser.toLowerCase() === input.database_user.toLowerCase()) {
    throw new AppError('El usuario de la base de datos debe ser distinto al usuario de KindMetrics.', {
      statusCode: 422,
      code: 'COMPANY_DATABASE_USER_CONFLICTS_WITH_APPLICATION_USER',
      field: 'database_user',
    });
  }

  const encryptedPassword = companyCredentialService.encrypt(input.database_password);

  let provisionedCompany: CompanyRow | undefined;
  try {
    [provisionedCompany] = await callRows<CompanyRow>('sp_company_management_provision_database', [
      companyId,
      input.database_name,
      input.database_user,
      encryptedPassword,
      input.database_password,
      applicationUser,
    ]);
  } catch (error) {
    return throwIfDuplicateCompanyCode(error);
  }

  if (!provisionedCompany) {
    throw new AppError('La empresa no existe o no fue posible aprovisionar su base de datos.', {
      statusCode: 404,
      code: 'COMPANY_NOT_FOUND',
    });
  }

  if (provisionedCompany.status.trim().toUpperCase() === 'ACTIVE') {
    try {
      await callRows<CompanyRow>('sp_company_management_deactivate', [companyId]);
    } catch (error) {
      throw new AppError(
        'Los procedimientos de aprovisionamiento están desactualizados y no se pudo dejar inactiva la empresa. Aplica DataBaseScripts/0011-company-provisioning-procedure.sql.',
        {
          statusCode: 503,
          code: 'COMPANY_PROCEDURE_MIGRATION_REQUIRED',
          cause: error,
        },
      );
    }
    throw new AppError(
      'Los procedimientos de aprovisionamiento están desactualizados. Aplica DataBaseScripts/0011-company-provisioning-procedure.sql y reintenta con las mismas credenciales.',
      {
        statusCode: 503,
        code: 'COMPANY_PROCEDURE_MIGRATION_REQUIRED',
      },
    );
  }

  try {
    await companyDatabaseInitializer.initialize({
      database: input.database_name,
      username: input.database_user,
      password: input.database_password,
    });
  } catch (error) {
    throw new AppError(
      'La base y el usuario fueron creados, pero no se pudieron instalar las tablas y procedimientos de Dashboards. La empresa permanece inactiva; corrige la causa y reintenta el mismo endpoint con las mismas credenciales.',
      {
        statusCode: 503,
        code: 'COMPANY_DATABASE_INITIALIZATION_FAILED',
        cause: error,
      },
    );
  }

  try {
    const [activeCompany] = await callRows<CompanyRow>('sp_company_management_update', [
      companyId,
      JSON.stringify({ estado: 'activo' }),
      null,
    ]);
    if (!activeCompany) {
      throw new AppError('No fue posible activar la empresa después de inicializar su base de datos.', {
        statusCode: 503,
        code: 'COMPANY_DATABASE_ACTIVATION_FAILED',
      });
    }
    return toDto(activeCompany);
  } catch (error) {
    return throwIfDuplicateCompanyCode(error);
  }
}

export async function updateCompany(
  id: number,
  input: CompanyUpdateInput,
): Promise<CompanyManagementDto | undefined> {
  try {
    const [row] = await callRows<CompanyRow>('sp_company_management_update', [
      id,
      JSON.stringify(input),
      null,
    ]);
    return row ? toDto(row) : undefined;
  } catch (error) {
    return throwIfDuplicateCompanyCode(error);
  }
}

export async function deactivateCompany(id: number): Promise<CompanyManagementDto | undefined> {
  const [row] = await callRows<CompanyRow>('sp_company_management_deactivate', [id]);
  return row ? toDto(row) : undefined;
}
