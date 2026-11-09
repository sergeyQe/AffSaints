import { ApiError } from '../api/client';
import { useTransition, type TransitionVars } from '../api/tasks';
import { notifyError, notifySuccess } from '../lib/notify';

const SUCCESS_TEXT: Record<TransitionVars['action'], string> = {
  take: 'Задача взята в работу',
  assign: 'Исполнитель назначен, задача в работе',
  submit: 'Работа сдана на проверку',
  accept: 'Работа принята',
  'request-revision': 'Задача отправлена на правки',
  reopen: 'Принятая работа возвращена на правки',
  cancel: 'Задача отменена',
  reassign: 'Исполнитель заменён',
  unassign: 'Задача возвращена в общий пул',
};

/**
 * Выполнение перехода с уведомлением; общий для кнопок карточки и перетаскивания на доске.
 * Уведомления привязаны к конкретному вызову (vars), поэтому при нескольких быстрых
 * переносах ошибка каждой карточки не теряется.
 */
export function useRunTransition(onResultRequired?: (taskId: number) => void) {
  const transition = useTransition({
    onSuccess: (_, vars) => notifySuccess(SUCCESS_TEXT[vars.action]),
    onError: (e, vars) => {
      // Без результата сдать нельзя — ведём пользователя к файлам именно этой задачи
      if (e instanceof ApiError && e.code === 'result_required') onResultRequired?.(vars.id);
      notifyError(e, 'Действие не выполнено');
    },
  });
  // onDone — только закрыть модалку; модалка одна, поэтому «последний вызов» здесь безопасен
  const run = (vars: TransitionVars, onDone?: () => void) =>
    transition.mutate(vars, { onSuccess: () => onDone?.() });
  return { run, isPending: transition.isPending };
}
