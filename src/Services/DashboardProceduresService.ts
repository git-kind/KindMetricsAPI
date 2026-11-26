import { AppError } from '../Errors/AppError.js';
import type { CompanyContext } from '../Models/Common.js';
import type { CreateDashboardProcedureDto, UpdateDashboardProcedureDto } from '../Models/DashboardProcedures/DashboardProcedureDto.js';
import { DashboardMetadataRepository } from '../Repositories/DashboardMetadataRepository.js';
import { DashboardProcedureRepository } from '../Repositories/DashboardProcedures/DashboardProcedureRepository.js';
import { actorId as resolveActorId } from '../Repositories/StoredProcedures/ActorRepository.js';

function persistenceError(error: unknown, context?: Record<string, unknown>): never {
  const message = error && typeof error === 'object' && 'sqlMessage' in error && typeof error.sqlMessage === 'string' ? error.sqlMessage : '';
  const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const errorNumber = error && typeof error === 'object' && 'errno' in error ? error.errno : undefined;
  if (
    errorCode === 'ER_NO_DEFAULT_FOR_FIELD' ||
    errorNumber === 1364 ||
    message.includes("Field 'id' doesn't have a default value")
  ) {
    throw new AppError(
      'El catálogo de procedimientos requiere la migración 0012-dashboard-procedure-id-auto-increment.sql en la base central.',
      {
        statusCode: 503,
        code: 'DASHBOARD_PROCEDURE_CATALOG_MIGRATION_REQUIRED',
        cause: error,
        ...(context ? { context } : {}),
      },
    );
  }
  if (message.includes('DASHBOARD_PROCEDURE_NOT_FOUND'))
    throw new AppError('El procedimiento autorizado no existe.', { statusCode: 404, code: 'DASHBOARD_PROCEDURE_NOT_FOUND' });
  if (message.includes('DASHBOARD_PROCEDURE_IN_USE'))
    throw new AppError('No se puede eliminar el procedimiento porque está asociado a Paneles.', { statusCode: 409, code: 'DASHBOARD_PROCEDURE_IN_USE' });
  if (message.includes('DASHBOARD_PROCEDURE_SIGNATURE_MISMATCH') || message.includes('DASHBOARD_PROCEDURE_NOT_AUTHORIZABLE'))
    throw new AppError('El procedimiento no existe, no está permitido o su firma no coincide.', { statusCode: 400, code: 'DASHBOARD_PROCEDURE_INVALID' });
  if (message.includes('DASHBOARD_VERSION_CONFLICT'))
    throw new AppError('El procedimiento fue modificado por otra operación.', { statusCode: 409, code: 'DASHBOARD_VERSION_CONFLICT' });
  if (message.includes('DASHBOARD_PROCEDURE_') || message.includes('INVALID_DASHBOARD_PROCEDURE'))
    throw new AppError('Los datos del procedimiento autorizado no son válidos.', { statusCode: 400, code: 'INVALID_DASHBOARD_PROCEDURE' });
  throw error;
}

export class DashboardProceduresService {
  constructor(
    private readonly repository = new DashboardProcedureRepository(),
    private readonly metadataRepository = new DashboardMetadataRepository(),
  ) {}

  async list(company: CompanyContext, userGuid: string) {
    try {
      const actor = await resolveActorId(userGuid);
      const discovered = await this.metadataRepository.discoverProcedures(company);
      const availableProcedureNames = new Set(
        discovered
          .filter(
            (procedure) =>
              procedure.executable &&
              /^sp_dash_[a-zA-Z0-9_]{1,112}$/.test(procedure.procedureName),
          )
          .map((procedure) => procedure.procedureName),
      );
      for (const procedure of discovered) {
        if (availableProcedureNames.has(procedure.procedureName)) {
          const parametersSchema = {
            schemaVersion: 1 as const,
            parameters: procedure.parameters.map((parameter) => ({
              name: parameter.name,
              type: parameter.type,
              required: true,
            })),
          };
          try {
            await this.repository.syncDiscoveredProcedure(
              company,
              procedure.procedureName,
              parametersSchema,
              actor,
            );
          } catch (error) {
            const connection = this.repository.getCatalogConnectionDetails();
            return persistenceError(error, {
              database: connection.database,
              databaseUser: connection.databaseUser,
              procedureName: procedure.procedureName,
              parameters: procedure.parameters.map(({ name, type, mode }) => ({
                name,
                type,
                mode,
              })),
              companyCode: company.code,
            });
          }
        }
      }
      const catalogProcedures = await this.repository.list(company, true);
      return catalogProcedures.filter(
        (procedure) =>
          procedure.status === 'ACTIVE' &&
          availableProcedureNames.has(procedure.procedureName),
      );
    } catch (error) {
      return persistenceError(error);
    }
  }

  async get(company: CompanyContext, guid: string) {
    try {
      const procedure = await this.repository.get(company, guid, true);
      if (!procedure) throw new AppError('El procedimiento autorizado no existe.', { statusCode: 404, code: 'DASHBOARD_PROCEDURE_NOT_FOUND' });
      return procedure;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }

  async create(company: CompanyContext, input: CreateDashboardProcedureDto, userGuid: string) {
    try {
      const actor = await resolveActorId(userGuid);
      const procedure = await this.repository.create(company, input, actor);
      if (!procedure) throw new AppError('No se pudo registrar el procedimiento.', { code: 'DASHBOARD_PROCEDURE_CREATE_FAILED' });
      return procedure;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }

  async update(company: CompanyContext, guid: string, input: UpdateDashboardProcedureDto, userGuid: string) {
    try {
      const actor = await resolveActorId(userGuid);
      const procedure = await this.repository.update(company, guid, input, actor);
      if (!procedure) throw new AppError('El procedimiento autorizado no existe.', { statusCode: 404, code: 'DASHBOARD_PROCEDURE_NOT_FOUND' });
      return procedure;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }

  async delete(company: CompanyContext, guid: string) {
    try {
      if (!(await this.repository.delete(company, guid)))
        throw new AppError('El procedimiento autorizado no existe.', { statusCode: 404, code: 'DASHBOARD_PROCEDURE_NOT_FOUND' });
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
}
