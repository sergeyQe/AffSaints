import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import { notifyError } from '../lib/notify';
import { BOARD_REFETCH_MS, taskKeys, type UserBrief } from './tasks';

export type AttachmentKind = 'reference' | 'result';

export interface Attachment {
  id: number;
  kind: AttachmentKind;
  round: number;
  type: 'link' | 'file';
  url: string | null;
  filename: string | null;
  content_type: string | null;
  size: number | null;
  created_by: UserBrief;
  created_at: string;
}

/** Максимальный размер файла — как на backend (решение №6). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
];

const key = (taskId: number) => ['tasks', 'attachments', taskId] as const;

export const fileUrl = (a: Pick<Attachment, 'id'>) => `/api/attachments/${a.id}/file`;

export function useAttachments(taskId: number) {
  return useQuery({
    queryKey: key(taskId),
    queryFn: () => api<Attachment[]>(`/tasks/${taskId}/attachments`),
    refetchInterval: BOARD_REFETCH_MS,
  });
}

export function useAttachmentMutation(taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      vars:
        | { op: 'link'; kind: AttachmentKind; url: string }
        | { op: 'file'; kind: AttachmentKind; file: File }
        | { op: 'remove'; id: number },
    ) => {
      if (vars.op === 'link') {
        return api(`/tasks/${taskId}/attachments/link`, {
          method: 'POST',
          body: { kind: vars.kind, url: vars.url },
        });
      }
      if (vars.op === 'file') {
        const form = new FormData();
        form.append('kind', vars.kind);
        form.append('file', vars.file);
        return api(`/tasks/${taskId}/attachments/file`, { method: 'POST', body: form });
      }
      return api(`/attachments/${vars.id}`, { method: 'DELETE' });
    },
    // Ошибка — на уровне хука: при загрузке нескольких файлов сообщение придёт по каждому
    onError: (e, vars) =>
      notifyError(e, vars.op === 'file' ? `Файл «${vars.file.name}» не загружен` : 'Ошибка'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key(taskId) });
      void qc.invalidateQueries({ queryKey: taskKeys.events(taskId) });
    },
  });
}
