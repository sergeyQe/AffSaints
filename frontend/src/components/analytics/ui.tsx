import { Paper, Stack, Text, Title } from '@mantine/core';
import { type ReactNode } from 'react';

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

export const EmptyState = ({ children }: { children: ReactNode }) => (
  <Text size="sm" c="dimmed" py="md" ta="center">
    {children}
  </Text>
);
