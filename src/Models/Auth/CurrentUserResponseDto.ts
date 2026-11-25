import type { UserRole } from './UserRole.js';

export interface CurrentUserResponseDto {
  guid: string;
  email: string;
  name: string;
  platformAdmin: boolean;
  role: UserRole;
}
