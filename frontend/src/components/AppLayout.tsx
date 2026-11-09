import { AppShell, Burger, Button, Group, NavLink, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArchive,
  IconChartBar,
  IconLayoutKanban,
  IconLogout,
  IconRobot,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom';

import { useLogout } from '../api/auth';
import type { Role, User } from '../api/types';
import { hasRole } from '../lib/roles';
import { RoleBadges } from './RoleBadges';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Доска задач', icon: IconLayoutKanban },
  { to: '/archive', label: 'Архив', icon: IconArchive },
  { to: '/analytics', label: 'Аналитика', icon: IconChartBar, roles: ['head'] },
  { to: '/users', label: 'Пользователи', icon: IconUsers, roles: ['head'] },
  { to: '/ai-services', label: 'AI-сервисы', icon: IconRobot, roles: ['head'] },
];

export function AppLayout({ user }: { user: User }) {
  const [opened, { toggle, close }] = useDisclosure();
  const logout = useLogout();
  const navigate = useNavigate();

  // Пункты меню фильтруются по ролям; права всё равно проверяет backend
  const items = NAV_ITEMS.filter((i) => !i.roles || hasRole(user, ...i.roles));

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <Text fw={700} visibleFrom="xs">
              Креативный отдел
            </Text>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Stack gap={0} align="flex-end" visibleFrom="sm">
              <Text size="sm" fw={500}>
                {user.full_name}
              </Text>
              <RoleBadges roles={user.roles} size="xs" />
            </Stack>
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconLogout size={16} />}
              loading={logout.isPending}
              onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
            >
              Выйти
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {items.map((item) => (
          <NavLink
            key={item.to}
            component={RouterNavLink}
            to={item.to}
            end={item.to === '/'}
            label={item.label}
            leftSection={<item.icon size={18} />}
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
