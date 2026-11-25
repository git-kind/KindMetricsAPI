import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callRows } = vi.hoisted(() => ({
  callRows: vi.fn(),
}));

vi.mock('../src/Repositories/StoredProcedures/ProcedureExecutor.js', () => ({
  callRows,
}));

import { listAvailableCompanies } from '../src/Repositories/UserCompanyAccessRepository.js';

describe('listAvailableCompanies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all active companies to Admin', async () => {
    const companies = [
      { id: 11, name: 'Empresa Uno', code: 'UNO' },
      { id: 12, name: 'Empresa Dos', code: 'DOS' },
    ];
    callRows.mockResolvedValueOnce([{ role: 'Admin' }]);
    callRows.mockResolvedValueOnce(companies);

    await expect(listAvailableCompanies('admin-guid')).resolves.toEqual(
      companies,
    );
    expect(callRows).toHaveBeenNthCalledWith(
      1,
      'sp_company_management_user_profile',
      ['admin-guid'],
    );
    expect(callRows).toHaveBeenNthCalledWith(
      2,
      'sp_user_company_access_companies',
      [],
    );
  });

  it('limits Editor company selection to assigned companies', async () => {
    const companies = [{ id: 11, name: 'Empresa Uno', code: 'UNO' }];
    callRows.mockResolvedValueOnce([{ role: 'Editor' }]);
    callRows.mockResolvedValueOnce(companies);

    await expect(listAvailableCompanies('editor-guid')).resolves.toEqual(
      companies,
    );
    expect(callRows).toHaveBeenNthCalledWith(
      2,
      'sp_user_available_companies',
      ['editor-guid'],
    );
  });

  it('keeps Viewer company selection limited to assigned companies', async () => {
    const companies = [{ id: 11, name: 'Empresa Uno', code: 'UNO' }];
    callRows.mockResolvedValueOnce([{ perfil: 'Viewer' }]);
    callRows.mockResolvedValueOnce(companies);

    await expect(listAvailableCompanies('viewer-guid')).resolves.toEqual(
      companies,
    );
    expect(callRows).toHaveBeenNthCalledWith(
      2,
      'sp_user_available_companies',
      ['viewer-guid'],
    );
  });
});
