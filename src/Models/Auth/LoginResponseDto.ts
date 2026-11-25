import type { UserRole } from './UserRole.js';

export interface LoginUserDto {
  guid: string;
  email: string;
  name: string;
  platformAdmin?: boolean;
  role: UserRole;
  perfil: UserRole;
}

export interface LoginResponseDto {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: LoginUserDto;
}
