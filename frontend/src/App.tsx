import { Route, Routes } from 'react-router-dom';

import { AppLayout } from './components/AppLayout';
import { AiServicesPage } from './pages/AiServicesPage';
import { RequireAuth } from './components/RequireAuth';
import { BoardPage } from './pages/BoardPage';
import { NotFoundPage } from './pages/ForbiddenPage';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/UsersPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth>{(user) => <AppLayout user={user} />}</RequireAuth>}>
        <Route index element={<BoardPage />} />
        <Route
          path="users"
          element={
            <RequireAuth roles={['head']}>{(user) => <UsersPage currentUser={user} />}</RequireAuth>
          }
        />
        <Route
          path="ai-services"
          element={<RequireAuth roles={['head']}>{() => <AiServicesPage />}</RequireAuth>}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
