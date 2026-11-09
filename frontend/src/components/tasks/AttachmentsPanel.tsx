import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import {
  IconExternalLink,
  IconFile,
  IconFileTypePdf,
  IconLink,
  IconMovie,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { useState } from 'react';

import {
  ACCEPTED_MIME,
  fileUrl,
  MAX_FILE_BYTES,
  useAttachmentMutation,
  useAttachments,
  type Attachment,
  type AttachmentKind,
} from '../../api/attachments';
import type { TaskDetail } from '../../api/tasks';
import { formatSize } from '../../lib/format';
import { formatDateTime } from '../../lib/tasks';

/** Страховка: в href попадают только http(s)-ссылки (backend и так пропускает только их). */
function safeHref(url: string | null): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

function AttachmentIcon({ a }: { a: Attachment }) {
  if (a.type === 'link') return <IconLink size={20} />;
  if (a.content_type?.startsWith('video/')) return <IconMovie size={20} />;
  if (a.content_type === 'application/pdf') return <IconFileTypePdf size={20} />;
  return <IconFile size={20} />;
}

function AttachmentItem({
  a,
  canRemove,
  onRemove,
}: {
  a: Attachment;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const href = a.type === 'link' ? safeHref(a.url) : fileUrl(a);
  const isImage = a.type === 'file' && a.content_type?.startsWith('image/');
  return (
    <Paper withBorder p="xs" radius="sm">
      <Stack gap={6}>
        {isImage && (
          <Anchor href={href} target="_blank" rel="noopener noreferrer">
            <Image src={href} alt={a.filename ?? ''} h={120} fit="cover" radius="sm" />
          </Anchor>
        )}
        <Group gap="xs" wrap="nowrap" justify="space-between">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <AttachmentIcon a={a} />
            <Anchor
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              truncate
              style={{ minWidth: 0 }}
            >
              {a.filename ?? a.url}
            </Anchor>
            {a.type === 'link' && <IconExternalLink size={12} />}
          </Group>
          {canRemove && (
            <Tooltip label="Удалить">
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={onRemove}
                aria-label={`Удалить ${a.filename ?? a.url}`}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {a.created_by.full_name} · {formatDateTime(a.created_at)}
          {a.size ? ` · ${formatSize(a.size)}` : ''}
        </Text>
      </Stack>
    </Paper>
  );
}

function AddAttachment({ taskId, kind }: { taskId: number; kind: AttachmentKind }) {
  const mutation = useAttachmentMutation(taskId);
  const [url, setUrl] = useState('');

  const addLink = () => {
    if (!url.trim()) return;
    mutation.mutate({ op: 'link', kind, url: url.trim() }, { onSuccess: () => setUrl('') });
  };

  return (
    <Stack gap="xs">
      <Dropzone
        onDrop={(files) => files.forEach((file) => mutation.mutate({ op: 'file', kind, file }))}
        onReject={() =>
          notifications.show({
            color: 'red',
            title: 'Файл не подходит',
            message: 'Только изображения, видео (MP4/WebM/MOV) и PDF до 20 МБ',
          })
        }
        maxSize={MAX_FILE_BYTES}
        inputProps={{
          'aria-label': kind === 'result' ? 'Загрузить результат' : 'Загрузить референс',
        }}
        accept={ACCEPTED_MIME}
        loading={mutation.isPending}
        p="md"
      >
        <Group justify="center" gap="sm" style={{ pointerEvents: 'none' }}>
          <IconUpload size={22} />
          <div>
            <Text size="sm">Перетащите файлы сюда или нажмите, чтобы выбрать</Text>
            <Text size="xs" c="dimmed">
              Изображения, видео, PDF — до 20 МБ. Тяжёлые видео — ссылкой.
            </Text>
          </div>
        </Group>
      </Dropzone>
      <Group gap="xs" wrap="nowrap">
        <TextInput
          placeholder="https://drive.google.com/…"
          aria-label={kind === 'result' ? 'Ссылка на результат' : 'Ссылка на референс'}
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && addLink()}
          leftSection={<IconLink size={14} />}
          style={{ flex: 1 }}
        />
        <Button variant="light" onClick={addLink} loading={mutation.isPending}>
          Добавить ссылку
        </Button>
      </Group>
    </Stack>
  );
}

export function AttachmentsPanel({ task }: { task: TaskDetail }) {
  const attachments = useAttachments(task.id);
  const mutation = useAttachmentMutation(task.id);
  const items = attachments.data ?? [];
  const references = items.filter((a) => a.kind === 'reference');
  const results = items.filter((a) => a.kind === 'result');
  const canRef = task.actions.includes('add_reference');
  const canResult = task.actions.includes('add_result');

  // Результаты по версиям: круг 0 — первая сдача, N — после N-й отправки на правки
  const rounds = [...new Set(results.map((r) => r.round))].sort((a, b) => b - a);
  const remove = (id: number) => mutation.mutate({ op: 'remove', id });

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={5}>Референсы</Title>
        {references.length === 0 && !canRef && (
          <Text size="sm" c="dimmed">
            Референсов нет.
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          {references.map((a) => (
            <AttachmentItem key={a.id} a={a} canRemove={canRef} onRemove={() => remove(a.id)} />
          ))}
        </SimpleGrid>
        {canRef && <AddAttachment taskId={task.id} kind="reference" />}
      </Stack>

      <Stack gap="xs">
        <Title order={5}>Результаты</Title>
        {canResult && (
          <Text size="sm" c="dimmed">
            {task.revision_count > 0
              ? `Приложите исправленную версию (версия ${task.revision_count + 1}) — без неё сдать нельзя.`
              : 'Приложите результат — без него сдать работу нельзя.'}
          </Text>
        )}
        {results.length === 0 && !canResult && (
          <Text size="sm" c="dimmed">
            Результатов пока нет.
          </Text>
        )}
        {rounds.map((round) => (
          <Stack key={round} gap={6}>
            <Badge variant="light" color={round === task.revision_count ? 'violet' : 'gray'}>
              Версия {round + 1}
            </Badge>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {results
                .filter((r) => r.round === round)
                .map((a) => (
                  <AttachmentItem
                    key={a.id}
                    a={a}
                    canRemove={canResult && round === task.revision_count}
                    onRemove={() => remove(a.id)}
                  />
                ))}
            </SimpleGrid>
          </Stack>
        ))}
        {canResult && <AddAttachment taskId={task.id} kind="result" />}
      </Stack>
    </Stack>
  );
}
