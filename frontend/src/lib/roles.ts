import type { Role, User } from '../api/types';

export const ROLE_LABELS: Record<Role, string> = {
  buyer: 'Байер',
  creative: 'Креативщик',
  head: 'Руководитель',
};

export const ROLE_COLORS: Record<Role, string> = {
  buyer: 'blue',
  creative: 'grape',
  head: 'orange',
};

export const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

export function hasRole(user: Pick<User, 'roles'> | null | undefined, ...roles: Role[]): boolean {
  return !!user && user.roles.some((r) => roles.includes(r));
}
