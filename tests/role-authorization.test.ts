import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCompanyManagementUserProfile } = vi.hoisted(() => ({
  getCompanyManagementUserProfile: vi.fn(),
}));

vi.mock('../src/Repositories/CompanyManagementRepository.js', () => ({
  getCompanyManagementUserProfile,
}));

import { authenticate } from '../src/Middleware/Security.js';
import { authorizeRoles } from '../src/Middleware/RoleAuthorization.js';

describe('role authorization', () => {
  let app: ReturnType<typeof Fastify>;
  let handlerCalls: string[];

  beforeEach(async () => {
    vi.clearAllMocks();
    handlerCalls = [];
    app = Fastify();
    await app.register(jwt, { secret: '0123456789abcdef0123456789abcdef' });
    app.get(
      '/users',
      { preHandler: [authenticate, authorizeRoles(['Admin'])] },
      async () => {
        handlerCalls.push('users');
        return { ok: true };
      },
    );
    app.get(
      '/companies/management',
      { preHandler: [authenticate, authorizeRoles(['Admin'])] },
      async () => {
        handlerCalls.push('companies');
        return { ok: true };
      },
    );
    app.get(
      '/dashboards',
      { preHandler: [authenticate, authorizeRoles(['Admin', 'Editor', 'Viewer'])] },
      async () => {
        handlerCalls.push('dashboards');
        return { ok: true };
      },
    );
    app.post(
      '/dashboards',
      { preHandler: [authenticate, authorizeRoles(['Admin', 'Editor'])] },
      async () => {
        handlerCalls.push('dashboard-write');
        return { ok: true };
      },
    );
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function request(
    method: 'GET' | 'POST',
    path: string,
    role: 'Admin' | 'Editor' | 'Viewer',
  ) {
    getCompanyManagementUserProfile.mockResolvedValue(role);
    const token = app.jwt.sign({
      sub: role.toLowerCase() + '-guid',
      platformAdmin: false,
      role,
    });
    return app.inject({
      method,
      url: path,
      headers: { authorization: ['Bearer', token].join(' ') },
    });
  }

  it('allows only Admin to enter user management routes', async () => {
    expect((await request('GET', '/users', 'Editor')).statusCode).toBe(403);
    expect((await request('GET', '/users', 'Viewer')).statusCode).toBe(403);
    expect((await request('GET', '/users', 'Admin')).statusCode).toBe(200);
    expect(handlerCalls).toEqual(['users']);
  });

  it('allows only Admin to enter company management routes', async () => {
    expect((await request('GET', '/companies/management', 'Editor')).statusCode).toBe(403);
    expect((await request('GET', '/companies/management', 'Viewer')).statusCode).toBe(403);
    expect((await request('GET', '/companies/management', 'Admin')).statusCode).toBe(200);
    expect(handlerCalls).toEqual(['companies']);
  });

  it('allows Editor to manage dashboards and limits Viewer to read access', async () => {
    expect((await request('GET', '/dashboards', 'Viewer')).statusCode).toBe(200);
    expect((await request('POST', '/dashboards', 'Viewer')).statusCode).toBe(403);
    expect((await request('GET', '/dashboards', 'Editor')).statusCode).toBe(200);
    expect((await request('POST', '/dashboards', 'Editor')).statusCode).toBe(200);
    expect((await request('GET', '/dashboards', 'Admin')).statusCode).toBe(200);
    expect((await request('POST', '/dashboards', 'Admin')).statusCode).toBe(200);
    expect(handlerCalls).toEqual([
      'dashboards',
      'dashboards',
      'dashboard-write',
      'dashboards',
      'dashboard-write',
    ]);
  });
});
