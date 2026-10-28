import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { CompanyConnectionManager, type CompanyPoolConfig } from '../src/Services/CompanyConnectionManager.js';

function config(overrides: Partial<CompanyPoolConfig> = {}): CompanyPoolConfig {
  return {
    host: '127.0.0.1',
    port: 3306,
    database: 'company_db',
    username: 'company_user',
    password: 'password',
    ssl: false,
    connectionLimit: 10,
    ...overrides,
  };
}

function fakePool() {
  return { end: vi.fn(async () => undefined) } as unknown as Pool;
}

describe('CompanyConnectionManager', () => {
  it('reuses a pool for the same company and effective configuration', async () => {
    const pools: Pool[] = [];
    const manager = new CompanyConnectionManager(() => {
      const pool = fakePool();
      pools.push(pool);
      return pool;
    });

    try {
      const first = await manager.getPool(1, config());
      const second = await manager.getPool(1, config());

      expect(second).toBe(first);
      expect(pools).toHaveLength(1);
    } finally {
      await manager.closeAll();
    }
  });

  it('coalesces concurrent pool creation and isolates different companies', async () => {
    const pools: Pool[] = [];
    const manager = new CompanyConnectionManager(() => {
      const pool = fakePool();
      pools.push(pool);
      return pool;
    });

    try {
      const sameCompany = await Promise.all([
        manager.getPool(1, config()),
        manager.getPool(1, config()),
      ]);
      const otherCompany = await manager.getPool(2, config());

      expect(sameCompany[0]).toBe(sameCompany[1]);
      expect(otherCompany).not.toBe(sameCompany[0]);
      expect(pools).toHaveLength(2);
    } finally {
      await manager.closeAll();
    }
  });

  it('replaces a company pool after effective credentials change', async () => {
    const pools: Pool[] = [];
    const manager = new CompanyConnectionManager(() => {
      const pool = fakePool();
      pools.push(pool);
      return pool;
    });

    try {
      const first = await manager.getPool(1, config());
      const [updated, concurrentlyUpdated] = await Promise.all([
        manager.getPool(1, config({ password: 'rotated-password' })),
        manager.getPool(1, config({ password: 'rotated-password' })),
      ]);

      expect(updated).not.toBe(first);
      expect(concurrentlyUpdated).toBe(updated);
      expect(pools).toHaveLength(2);
      expect(pools[0]?.end).toHaveBeenCalledOnce();
    } finally {
      await manager.closeAll();
    }
  });

  it('closes all retained pools when the API shuts down', async () => {
    const pools: Pool[] = [];
    const manager = new CompanyConnectionManager(() => {
      const pool = fakePool();
      pools.push(pool);
      return pool;
    });

    await manager.getPool(1, config());
    await manager.getPool(2, config());
    await manager.closeAll();

    expect(pools.every((pool) => vi.mocked(pool.end).mock.calls.length === 1)).toBe(true);
  });
});
