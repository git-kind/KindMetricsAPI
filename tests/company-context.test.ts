import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/Repositories/StoredProcedures/AuthRepository.js', () => ({
  companyAccess: vi.fn(),
  permission: vi.fn(),
}));
vi.mock('../src/Repositories/CompanyManagementRepository.js', () => ({
  getCompanyManagementUserProfile: vi.fn(),
  resolveCompanyByCode: vi.fn(),
}));

import { getCompanyManagementUserProfile, resolveCompanyByCode } from '../src/Repositories/CompanyManagementRepository.js';
import { companyAccess } from '../src/Repositories/StoredProcedures/AuthRepository.js';
import { requireDashboardAdmin, resolveCompany, resolveDashboardReadAccess } from '../src/Middleware/Security.js';

function requestWith(code: string | undefined, platformAdmin = false): FastifyRequest {
  return {
    headers: code === undefined ? {} : { 'x-company-code': code },
    principal: { sub: 'user-guid', platformAdmin },
    id: 'test-request',
  } as unknown as FastifyRequest;
}

function replyDouble() {
  const state: { status?: number; body?: unknown } = {};
  const reply = {
    code(status: number) {
      state.status = status;
      return this;
    },
    send(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as FastifyReply;
  return { reply, state };
}

describe('Company context resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires x-company-code and rejects the legacy GUID header', async () => {
    const request = {
      headers: { 'x-company-guid': '123e4567-e89b-12d3-a456-426614174000' },
      principal: { sub: 'user-guid', platformAdmin: false },
      id: 'test-request',
    } as unknown as FastifyRequest;
    const { reply, state } = replyDouble();

    await resolveCompany(request, reply);

    expect(state.status).toBe(400);
    expect(resolveCompanyByCode).not.toHaveBeenCalled();
    expect(companyAccess).not.toHaveBeenCalled();
  });

  it('does not resolve malformed codes from the administrative catalog', async () => {
    const request = requestWith('../database');
    const { reply, state } = replyDouble();

    await resolveCompany(request, reply);

    expect(state.status).toBe(400);
    expect(resolveCompanyByCode).not.toHaveBeenCalled();
  });

  it('rejects unknown and inactive companies before checking user membership', async () => {
    const request = requestWith('ACME');
    const { reply, state } = replyDouble();
    vi.mocked(resolveCompanyByCode).mockResolvedValueOnce(undefined);

    await resolveCompany(request, reply);

    expect(state.status).toBe(404);
    expect(companyAccess).not.toHaveBeenCalled();

    vi.mocked(resolveCompanyByCode).mockResolvedValueOnce({
      id: 8,
      guid: '123e4567-e89b-12d3-a456-426614174000',
      code: 'ACME',
      status: 'INACTIVE',
    });
    await resolveCompany(request, reply);
    expect(state.status).toBe(404);
    expect(companyAccess).not.toHaveBeenCalled();
  });

  it('rejects users without membership and creates an authorized context otherwise', async () => {
    const request = requestWith('acme');
    const { reply, state } = replyDouble();
    vi.mocked(resolveCompanyByCode).mockResolvedValue({
      id: 8,
      guid: '123e4567-e89b-12d3-a456-426614174000',
      code: 'ACME',
      status: 'ACTIVE',
    });
    vi.mocked(companyAccess).mockResolvedValueOnce(undefined);

    await resolveCompany(request, reply);
    expect(state.status).toBe(403);

    vi.mocked(companyAccess).mockResolvedValueOnce({ id: 8 });
    await resolveCompany(request, reply);
    expect(request.company).toEqual({
      id: 8,
      guid: '123e4567-e89b-12d3-a456-426614174000',
      code: 'ACME',
    });
  });

  it('rejects switching the company header to a company without membership', async () => {
    const request = requestWith('AUTHORIZED');
    const { reply, state } = replyDouble();
    vi.mocked(resolveCompanyByCode)
      .mockResolvedValueOnce({
        id: 8,
        guid: '123e4567-e89b-12d3-a456-426614174008',
        code: 'AUTHORIZED',
        status: 'ACTIVE',
      })
      .mockResolvedValueOnce({
        id: 9,
        guid: '123e4567-e89b-12d3-a456-426614174009',
        code: 'OTHER',
        status: 'ACTIVE',
      });
    vi.mocked(companyAccess).mockResolvedValueOnce({ id: 8 });

    await resolveCompany(request, reply);
    expect(request.company?.code).toBe('AUTHORIZED');

    request.headers['x-company-code'] = 'OTHER';
    vi.mocked(companyAccess).mockResolvedValueOnce(undefined);
    await resolveCompany(request, reply);

    expect(state.status).toBe(403);
    expect(request.company).toBeUndefined();
  });

  it('allows a platform administrator to resolve a company without a membership row', async () => {
    const request = requestWith('ACME', true);
    const { reply } = replyDouble();
    vi.mocked(resolveCompanyByCode).mockResolvedValue({
      id: 8,
      guid: '123e4567-e89b-12d3-a456-426614174000',
      code: 'ACME',
      status: 'ACTIVE',
    });

    await resolveCompany(request, reply);

    expect(companyAccess).not.toHaveBeenCalled();
    expect(request.company?.code).toBe('ACME');
  });

  it('allows Admin and Editor to manage Dashboards while Visor remains read-only', async () => {
    const viewerRequest = requestWith('ACME');
    viewerRequest.company = {
      id: 8,
      guid: '123e4567-e89b-12d3-a456-426614174000',
      code: 'ACME',
    };
    const { reply, state } = replyDouble();
    vi.mocked(getCompanyManagementUserProfile).mockResolvedValueOnce('Visor');

    await resolveDashboardReadAccess(viewerRequest, reply);
    expect(viewerRequest.dashboardCanManage).toBe(false);

    vi.mocked(getCompanyManagementUserProfile).mockResolvedValueOnce('Visor');
    await requireDashboardAdmin(viewerRequest, reply);
    expect(state.status).toBe(403);

    const editorRequest = requestWith('ACME');
    editorRequest.company = viewerRequest.company;
    vi.mocked(getCompanyManagementUserProfile).mockResolvedValueOnce('Editor');
    await resolveDashboardReadAccess(editorRequest, reply);
    expect(editorRequest.dashboardCanManage).toBe(true);

    vi.mocked(getCompanyManagementUserProfile).mockResolvedValueOnce('Editor');
    await requireDashboardAdmin(editorRequest, reply);
    expect(editorRequest.dashboardCanManage).toBe(true);

    const adminRequest = requestWith('ACME');
    adminRequest.company = viewerRequest.company;
    vi.mocked(getCompanyManagementUserProfile).mockResolvedValueOnce('Admin');
    await resolveDashboardReadAccess(adminRequest, reply);
    expect(adminRequest.dashboardCanManage).toBe(true);
  });
});
