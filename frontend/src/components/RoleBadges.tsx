import { Badge, Group } from '@mantine/core';

import type { Role } from '../api/types';
import { ROLE_COLORS, ROLE_LABELS } from '../lib/roles';

export function RoleBadges({ roles, size = 'sm' }: { roles: Role[]; size?: 'xs' | 'sm' }) {
  return (
    <Group gap={4} wrap="nowrap">
      {roles.map((r) => (
        <Badge key={r} size={size} variant="light" color={ROLE_COLORS[r]}>
          {ROLE_LABELS[r]}
        </Badge>
      ))}
    </Group>
  );
}
