import { resolveDatasource } from '../Repositories/StoredProcedures/DatasourceConnectionRepository.js';
import { executeReadOnly } from '../Repositories/Queries/QueryRepository.js';
export class QueryService {
  async execute(companyId: number, datasourceGuid: string, sql: string, params: (string | number | boolean | null)[], maxRows: number) {
    // FAIL CLOSED: SQL parser/AST validation and secret manager are required before enabling this endpoint.
    // Never execute arbitrary user SQL with regex-based checks or admin credentials.
    void companyId; void datasourceGuid; void sql; void params; void maxRows; void resolveDatasource; void executeReadOnly;
    throw new Error('QUERY_ENGINE_NOT_CONFIGURED');
  }
}
