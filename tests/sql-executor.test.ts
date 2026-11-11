import { describe, expect, it, vi } from 'vitest';
import type { FieldPacket, Pool } from 'mysql2/promise';
import { callStoredProcedure, procedureColumnsFromFields, setStoredProcedureLogger } from '../src/Database/SqlExecutor.js';

describe('Stored Procedure result metadata', () => {
  it('maps MySQL field packets to dashboard result columns', () => {
    const fields = [
      { name: 'team_name', type: 253 },
      { name: 'total_calls', type: 8 },
      { name: 'average_duration', type: 246 },
      { name: 'started_at', type: 12 },
      { name: 'call_date', type: 10 },
    ] as FieldPacket[];

    expect(procedureColumnsFromFields(fields)).toEqual([
      { name: 'team_name', type: 'STRING' },
      { name: 'total_calls', type: 'INTEGER' },
      { name: 'average_duration', type: 'NUMBER' },
      { name: 'started_at', type: 'DATETIME' },
      { name: 'call_date', type: 'DATE' },
    ]);
  });

  it('uses the first result set metadata returned from CALL', () => {
    const fields = [
      [{ name: 'total_calls', type: 8 }],
      undefined,
    ] as unknown as FieldPacket[][];

    expect(procedureColumnsFromFields(fields)).toEqual([
      { name: 'total_calls', type: 'INTEGER' },
    ]);
  });

  it('returns no row sets when a write procedure only returns a result header', () => {
    expect(procedureResultSets({ affectedRows: 1 })).toEqual([]);
  });

  it('keeps row sets and filters non-row procedure results', () => {
    const rows = [{ id: 1, email: 'user@example.com' }];

    expect(procedureResultSets([rows, { affectedRows: 0 }])).toEqual([rows]);
  });
});

describe('Stored Procedure execution logging', () => {
  it('logs the procedure, configured database user, and database without logging arguments', async () => {
    const log = vi.fn();
    const query = vi.fn().mockResolvedValue([[[]], []]);
    const executor = {
      pool: {
        config: {
          connectionConfig: {
            host: '127.0.0.1',
            port: 3306,
            user: 'api_user',
            database: 'kindmetrics',
          },
        },
      },
      query,
    } as unknown as Pool;
    setStoredProcedureLogger(log);

    await callStoredProcedure(executor, 'sp_dashboard_list', ['sensitive-argument']);

    expect(log).toHaveBeenCalledWith(
      {
        procedure: 'sp_dashboard_list',
        databaseHost: '127.0.0.1',
        databasePort: '3306',
        databaseUser: 'api_user',
        database: 'kindmetrics',
      },
      'Executing stored procedure',
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive-argument');
  });
});
