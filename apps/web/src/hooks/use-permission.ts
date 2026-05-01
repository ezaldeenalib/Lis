import { useAuthStore } from '@/stores/auth.store';

/**
 * Returns a helper that checks whether the current user holds the given
 * permission string (e.g. "manage:user", "read:invoice").
 *
 * Lab admins with "manage:all" are granted every permission.
 * The hook is safe to call before the user is loaded (returns false).
 */
export function usePermission() {
  const user = useAuthStore((s) => s.user);

  const hasPermission = (permission: string): boolean => {
    if (!user?.permissions) return false;
    if (user.permissions.includes('manage:all')) return true;
    return user.permissions.includes(permission);
  };

  const hasAnyPermission = (...permissions: string[]): boolean =>
    permissions.some((p) => hasPermission(p));

  const hasAllPermissions = (...permissions: string[]): boolean =>
    permissions.every((p) => hasPermission(p));

  return { hasPermission, hasAnyPermission, hasAllPermissions };
}
