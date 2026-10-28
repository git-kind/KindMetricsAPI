import type { FastifyInstance } from 'fastify';
import { authRoutes } from '../Controllers/AuthController.js';
import { entityRoutes } from '../Controllers/EntityController.js';
import { userRoutes } from '../Controllers/UserController.js';
import { userManagementRoutes } from '../Controllers/UserManagementController.js';
import { companyManagementRoutes } from '../Controllers/CompanyManagementController.js';
import { userCompanyAccessRoutes } from '../Controllers/UserCompanyAccessController.js';
import { queryRoutes } from '../Controllers/QueryController.js';

const apiPrefix = '/api/v1';

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  // Auth component
  await app.register(authRoutes, { prefix: apiPrefix });

  // Generic entity CRUD component
  await app.register(entityRoutes, { prefix: apiPrefix });

  // Users component
  await app.register(userRoutes, { prefix: apiPrefix });

  // User management component
  await app.register(userManagementRoutes, { prefix: apiPrefix });

  // Company management component
  await app.register(companyManagementRoutes, { prefix: apiPrefix });

  // User-company access component
  await app.register(userCompanyAccessRoutes, { prefix: apiPrefix });

  // Query component
  await app.register(queryRoutes, { prefix: apiPrefix });
}
