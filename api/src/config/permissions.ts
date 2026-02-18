export const PERMISSIONS = [
  'analytics.read',
  'customers.read',
  'customers.write',
  'admin.users.read',
  'admin.users.write',
  'admin.audit.read',
  'alerts.manage',
  'reports.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export const VIEWER_DEFAULT_PERMISSIONS: Permission[] = ['analytics.read', 'customers.read'];

export function resolvePermissions(role: string, permissions?: string[]): string[] {
  if (role === 'admin') return ['*'];
  if (permissions && permissions.length > 0) return Array.from(new Set(permissions));
  return [...VIEWER_DEFAULT_PERMISSIONS];
}

export function hasPermission(
  user: { role: string; permissions?: string[] } | undefined,
  permission: Permission
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const effective = user.permissions && user.permissions.length > 0 ? user.permissions : VIEWER_DEFAULT_PERMISSIONS;
  return effective.includes(permission);
}
