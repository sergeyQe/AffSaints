import { Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useMe } from '../api/auth';
import type { Role, User } from '../api/types';
import { hasRole } from '../lib/roles';
import { ForbiddenPage } from '../pages/ForbiddenPage';

interface Props {
  roles?: Role[];
  children: (user: User) => ReactNode;
}

/** Пускает только авторизованных (и, если заданы, — с нужной ролью). */
export function RequireAuth({ roles, children }: Props) {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !hasRole(me.data, ...roles)) return <ForbiddenPage />;
  return <>{children(me.data)}</>;
}
