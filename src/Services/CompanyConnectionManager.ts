import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import type { Pool, PoolOptions } from 'mysql2/promise';
import { AppError } from '../Errors/AppError.js';

export interface CompanyPoolConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  connectionLimit: number;
}

interface PoolEntry {
  pool: Pool;
  fingerprint: string;
  idleTimer: NodeJS.Timeout;
}

interface PendingPool {
  fingerprint: string;
  promise: Promise<Pool>;
}

type PoolFactory = (options: PoolOptions) => Pool;

function getIdleTimeout(): number {
  const parsed = Number(process.env.DB_COMPANY_IDLE_TIMEOUT_MS ?? 60_000);
  return Number.isInteger(parsed) && parsed >= 1_000 ? parsed : 60_000;
}

function effectiveConfigFingerprint(config: CompanyPoolConfig): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        config.host,
        config.port,
        config.database,
        config.username,
        config.password,
        config.ssl,
        config.connectionLimit,
      ]),
    )
    .digest('hex');
}

export class CompanyConnectionManager {
  private readonly pools = new Map<number, PoolEntry>();
  private readonly pending = new Map<number, PendingPool>();

  constructor(private readonly createPool: PoolFactory = mysql.createPool) {}

  async getPool(companyId: number, config: CompanyPoolConfig): Promise<Pool> {
    const fingerprint = effectiveConfigFingerprint(config);
    const pending = this.pending.get(companyId);
    if (pending) {
      if (pending.fingerprint === fingerprint) {
        return pending.promise;
      }
      await pending.promise.catch(() => undefined);
      return this.getPool(companyId, config);
    }

    const promise = this.getOrCreatePool(companyId, config, fingerprint);
    this.pending.set(companyId, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      if (this.pending.get(companyId)?.promise === promise) {
        this.pending.delete(companyId);
      }
    }
  }

  private async getOrCreatePool(
    companyId: number,
    config: CompanyPoolConfig,
    fingerprint: string,
  ): Promise<Pool> {
    const existing = this.pools.get(companyId);
    if (existing?.fingerprint === fingerprint) {
      this.resetIdleTimer(companyId, existing);
      return existing.pool;
    }
    if (existing) {
      await this.closeEntry(companyId, existing);
    }
    const options: PoolOptions = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      waitForConnections: true,
      connectionLimit: config.connectionLimit,
      connectTimeout: 5_000,
      multipleStatements: false,
      timezone: 'Z',
      ...(config.ssl ? { ssl: {} } : {}),
    };
    const pool = this.createPool(options);
    const entry: PoolEntry = {
      pool,
      fingerprint,
      idleTimer: setTimeout(() => undefined, 0),
    };
    this.resetIdleTimer(companyId, entry);
    this.pools.set(companyId, entry);
    return pool;
  }

  async closeAll(): Promise<void> {
    const entries = [...this.pools.entries()];
    this.pools.clear();
    const results = await Promise.allSettled(entries.map(async ([, entry]) => {
      clearTimeout(entry.idleTimer);
      await entry.pool.end();
    }));
    if (results.some((result) => result.status === 'rejected')) {
      throw new AppError('No fue posible cerrar todos los pools de Company.', {
        statusCode: 503,
        code: 'COMPANY_POOL_CLOSE_FAILED',
      });
    }
  }

  private resetIdleTimer(companyId: number, entry: PoolEntry): void {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      if (this.pools.get(companyId) === entry) {
        this.pools.delete(companyId);
        void entry.pool.end().catch(() => {
          console.error('Failed to close an idle Company MySQL pool.', { companyId });
        });
      }
    }, getIdleTimeout());
    entry.idleTimer.unref();
  }

  private async closeEntry(companyId: number, entry: PoolEntry): Promise<void> {
    if (this.pools.get(companyId) === entry) {
      this.pools.delete(companyId);
    }
    clearTimeout(entry.idleTimer);
    try {
      await entry.pool.end();
    } catch {
      throw new AppError('No fue posible cerrar el pool anterior de la compañía.', {
        statusCode: 503,
        code: 'COMPANY_POOL_CLOSE_FAILED',
      });
    }
  }
}

export const companyConnectionManager = new CompanyConnectionManager();
