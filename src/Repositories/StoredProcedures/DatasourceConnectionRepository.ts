import { callRows } from './ProcedureExecutor.js';
export type DatasourceConnection = { host: string; port: number; database_name: string; username: string; password_secret: string };
export async function resolveDatasource(guid: string, companyId: number) { return (await callRows<DatasourceConnection>('sp_datasource_connection', [guid, companyId]))[0]; }
