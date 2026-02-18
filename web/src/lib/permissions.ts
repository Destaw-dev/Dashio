import type { Permission, User } from '@/lib/api';

export function hasPermission(user: User | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.permissions.includes(permission);
}
