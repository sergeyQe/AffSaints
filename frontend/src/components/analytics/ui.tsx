import { Anchor, Paper, Stack, Text, Title } from '@mantine/core';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { taskUrl } from '../../hooks/useTaskDrawer';
import type { DrawerTab } from '../tasks/TaskDrawer';

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Paper withBorder p="md" radius="md" component="section" aria-label={title}>
      <Stack gap="sm">
        <div>
          <Title order={5}>{title}</Title>
          {hint && (
            <Text size="xs" c="dimmed">
              {hint}
            </Text>
          )}
        </div>
        {children}
      </Stack>
    </Paper>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper withBorder p="md" radius="md" role="group" aria-label={label}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text fz={28} fw={700} lh={1.2} mt={4}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed" mt={2}>
          {hint}
        </Text>
      )}
    </Paper>
  );
}

/** Ячейка «Задача» в таблицах аналитики: ссылка на карточку и строка-подпись под ней. */
export function TaskCell({
  id,
  offer,
  sub,
  tab,
}: {
  id: number;
  offer: string;
  sub: string;
  tab?: DrawerTab;
}) {
  return (
    <>
      <Anchor component={Link} to={taskUrl(id, tab)} size="sm">
        #{id} {offer}
      </Anchor>
      <Text size="xs" c="dimmed">
        {sub}
      </Text>
    </>
  );
}

/** Подпись под таблицей, обрезанной лимитом строк на backend. */
export const TruncatedNote = ({ truncated, what }: { truncated: boolean; what: string }) =>
  truncated ? (
    <Text size="xs" c="dimmed">
      Показаны {what} — сузьте период или фильтры.
    </Text>
  ) : null;

export const EmptyState = ({ children }: { children: ReactNode }) => (
  <Text size="sm" c="dimmed" py="md" ta="center">
    {children}
  </Text>
);
