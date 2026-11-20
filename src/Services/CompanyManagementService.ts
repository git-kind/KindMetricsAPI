import {
  createCompany,
  deactivateCompany,
  getCompanyById,
  getCompanyManagementUserProfile,
  listCompanies,
  provisionCompanyDatabase,
  updateCompany,
} from '../Repositories/CompanyManagementRepository.js';

export class CompanyManagementService {
  getUserProfile(userGuid: string) {
    return getCompanyManagementUserProfile(userGuid);
  }

  list() {
    return listCompanies();
  }

  getById(id: number) {
    return getCompanyById(id);
  }

  provisionDatabase(companyId: number, input: Parameters<typeof provisionCompanyDatabase>[1]) {
    return provisionCompanyDatabase(companyId, input);
  }

  create(input: Parameters<typeof createCompany>[0]) {
    return createCompany(input);
  }

  update(id: number, input: Parameters<typeof updateCompany>[1]) {
    return updateCompany(id, input);
  }

  deactivate(id: number) {
    return deactivateCompany(id);
  }
}
