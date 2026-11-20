import {
  listAvailableCompanies,
  listUserCompanyAccess,
  replaceUserCompanyAccess,
} from '../Repositories/UserCompanyAccessRepository.js';

export class UserCompanyAccessService {
  listAvailableCompanies(userGuid: string) {
    return listAvailableCompanies(userGuid);
  }

  listUserCompanyAccess() {
    return listUserCompanyAccess();
  }

  replaceUserCompanyAccess(userGuid: string, companyIds: number[]) {
    return replaceUserCompanyAccess(userGuid, companyIds);
  }
}
