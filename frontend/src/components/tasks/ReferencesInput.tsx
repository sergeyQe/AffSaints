import { ActionIcon, Button, FileButton, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconFile, IconLink, IconPaperclip, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { ACCEPTED_MIME, MAX_FILE_BYTES } from '../../api/attachments';
import { formatSize, isHttpUrl } from '../../lib/format';

export interface ReferencesValue {
  links: string[];
  files: File[];
}

interface Props {
  value: ReferencesValue;
  onChange: (value: ReferencesValue) => void;
}

/** Референсы в форме ТЗ: ссылки и файлы, которые приложатся сразу после создания задачи. */
export function ReferencesInput({ value, onChange }: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addLink = () => {
    const clean = url.trim();
    if (!clean) return;
    if (!isHttpUrl(clean)) {
      setError('Ссылка должна начинаться с http:// или https://');
      return;
    }
    if (!value.links.includes(clean)) onChange({ ...value, links: [...value.links, clean] });
    setUrl('');
    setError(null);
  };

  const addFiles = (picked: File[]) => {
    // Те же ограничения, что на backend: тип и размер проверяем сразу, чтобы не ждать отказа
    const accepted = picked.filter(
      (f) => ACCEPTED_MIME.includes(f.type) && f.size <= MAX_FILE_BYTES,
    );
    const rejected = picked.length - accepted.length;
    setError(
      rejected
        ? `Пропущено файлов: ${rejected} — подходят изображения, видео (MP4/WebM/MOV) и PDF до 20 МБ`
        : null,
    );
    if (accepted.length) onChange({ ...value, files: [...value.files, ...accepted] });
  };

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        Референсы
      </Text>
      {/* На узком экране поле занимает всю строку, кнопки переносятся под него */}
      <Group gap="xs" wrap="wrap" align="flex-start">
        <TextInput
          placeholder="https://www.tiktok.com/…"
          aria-label="Ссылка на референс"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter добавляет ссылку, а не отправляет всю форму
            if (e.key === 'Enter') {
              e.preventDefault();
              addLink();
            }
          }}
          leftSection={<IconLink size={14} />}
          style={{ flex: '1 1 220px' }}
        />
        <Button variant="light" onClick={addLink}>
          Добавить ссылку
        </Button>
        <FileButton onChange={addFiles} accept={ACCEPTED_MIME.join(',')} multiple>
          {(props) => (
            <Button variant="default" leftSection={<IconPaperclip size={16} />} {...props}>
              Файлы
            </Button>
          )}
        </FileButton>
      </Group>
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}

      {value.links.map((link) => (
        <Group key={link} gap={6} wrap="nowrap">
          <IconLink size={14} />
          <Text size="sm" truncate style={{ flex: 1 }}>
            {link}
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            aria-label={`Убрать ${link}`}
            onClick={() => onChange({ ...value, links: value.links.filter((l) => l !== link) })}
          >
            <IconX size={14} />
          </ActionIcon>
        </Group>
      ))}
      {value.files.map((file, i) => (
        <Group key={`${file.name}-${i}`} gap={6} wrap="nowrap">
          <IconFile size={14} />
          <Text size="sm" truncate style={{ flex: 1 }}>
            {file.name}{' '}
            <Text span size="xs" c="dimmed">
              {formatSize(file.size)}
            </Text>
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            aria-label={`Убрать ${file.name}`}
            onClick={() => onChange({ ...value, files: value.files.filter((_, j) => j !== i) })}
          >
            <IconX size={14} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}
