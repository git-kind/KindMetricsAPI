import argon2 from 'argon2';
import { AppError } from '../Errors/AppError.js';
import type { CreateManagedUserDto, UpdateManagedUserDto } from '../Models/Users/UserManagementDto.js';
import {
  createManagedUser,
  deactivateManagedUser,
  getManagedUserById,
  isManagedUserEmailTaken,
  listManagedUsers,
  updateManagedUser,
} from '../Repositories/UserManagementRepository.js';

function throwDuplicateEmail(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  ) {
    throw new AppError('Ya existe un usuario con ese correo electrónico.', {
      statusCode: 409,
      code: 'USER_EMAIL_ALREADY_EXISTS',
      field: 'email',
    });
  }
  throw error;
}

export class UserManagementService {
  list() {
    return listManagedUsers();
  }

  getById(id: number) {
    return getManagedUserById(id);
  }

  async create(input: CreateManagedUserDto) {
    if (await isManagedUserEmailTaken(input.email)) {
      throw new AppError('Ya existe un usuario con ese correo electrónico.', {
        statusCode: 409,
        code: 'USER_EMAIL_ALREADY_EXISTS',
        field: 'email',
      });
    }

    try {
      const user = await createManagedUser({
        nombre: input.nombre,
        email: input.email,
        perfil: input.perfil,
        passwordHash: await argon2.hash(input.password),
      });
      if (!user) {
        throw new AppError('No se pudo recuperar el usuario recién creado.', {
          code: 'USER_CREATE_FAILED',
        });
      }
      return user;
    } catch (error) {
      return throwDuplicateEmail(error);
    }
  }

  async update(id: number, input: UpdateManagedUserDto) {
    if (input.email && (await isManagedUserEmailTaken(input.email, id))) {
      throw new AppError('Ya existe un usuario con ese correo electrónico.', {
        statusCode: 409,
        code: 'USER_EMAIL_ALREADY_EXISTS',
        field: 'email',
      });
    }

    try {
      return await updateManagedUser(id, {
        ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.perfil !== undefined ? { perfil: input.perfil } : {}),
        ...(input.password !== undefined
          ? { passwordHash: await argon2.hash(input.password) }
          : {}),
      });
    } catch (error) {
      return throwDuplicateEmail(error);
    }
  }

  async deactivate(id: number) {
    if (id === 1) {
      const user = await getManagedUserById(id);
      if (user?.email.toLowerCase() === 'admin@kindtech.com') {
        return { protected: true, deactivated: false };
      }
    }
    return { protected: false, deactivated: await deactivateManagedUser(id) };
  }
}
