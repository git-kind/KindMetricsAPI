export const userRoles = ['Admin', 'Editor', 'Viewer'] as const;

export type UserRole = (typeof userRoles)[number];

export function normalizeUserRole(value: unknown): UserRole | undefined {
  if (value === 'Visor') {
    return 'Viewer';
  }
  return userRoles.find((role) => role === value);
}
