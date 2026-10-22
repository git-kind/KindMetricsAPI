import argon2 from 'argon2';
import { AppError } from '../Errors/AppError.js';
import { createManagedUser, getManagedUserByEmail } from '../Repositories/UserManagementRepository.js';

const defaultUsers = [
  {
    nombre: 'Miguel Ortega',
    email: 'mortega@gmail.com',
    password: 'miguelito',
    perfil: 'Admin' as const,
  },
  {
    nombre: 'Carlos Visor Test',
    email: 'cvisor@gmail.com',
    password: 'visorcito123',
    perfil: 'Visor' as const,
  },
];

export async function seedDefaultUsers(): Promise<void> {
  for (const user of defaultUsers) {
    if (await getManagedUserByEmail(user.email)) continue;

    try {
      await createManagedUser({
        nombre: user.nombre,
        email: user.email,
        passwordHash: await argon2.hash(user.password),
        perfil: user.perfil,
        estatus: 'Activo',
      });
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'USER_EMAIL_ALREADY_EXISTS') {
        throw error;
      }
      if (!(await getManagedUserByEmail(user.email))) throw error;
    }
  }
}
