import { describe, expect, it } from 'vitest';
import type { FieldPacket } from 'mysql2/promise';
import { procedureColumnsFromFields, procedureResultSets } from '../src/Database/SqlExecutor.js';

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
