import { useSearchParams } from 'react-router-dom';

import type { DrawerTab } from '../components/tasks/TaskDrawer';

const TABS: DrawerTab[] = ['details', 'files', 'ai', 'history'];

/** Ссылка на карточку задачи на доске — в том же формате, что читает useTaskDrawer. */
export function taskUrl(id: number, tab: DrawerTab = 'details'): string {
  return tab === 'details' ? `/?task=${id}` : `/?task=${id}&tab=${tab}`;
}

/** Открытая задача и вкладка живут в URL (?task=12&tab=files) — ссылкой можно поделиться. */
export function useTaskDrawer() {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('task'));
  const taskId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const tabParam = params.get('tab') as DrawerTab | null;
  const tab: DrawerTab = tabParam && TABS.includes(tabParam) ? tabParam : 'details';

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  return {
    taskId,
    tab,
    open: (id: number, openTab: DrawerTab = 'details') =>
      update({ task: String(id), tab: openTab === 'details' ? null : openTab }),
    setTab: (t: DrawerTab) => update({ tab: t === 'details' ? null : t }),
    close: () => update({ task: null, tab: null }),
  };
}
