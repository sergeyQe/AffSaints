import { Button, Collapse, Group, Select, Stack, Switch, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconFilter, IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import type { Priority, TaskFilters } from '../../api/tasks';
import { useUsers } from '../../api/users';
import { useIsMobile } from '../../hooks/useIsMobile';
import { PRIORITY_LABELS, toOptions } from '../../lib/tasks';

interface Props {
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
  /** «Доступные только мне» — фильтр на клиенте, «Сбросить» его не трогает. */
  onlyMine?: boolean;
  onOnlyMineChange?: (next: boolean) => void;
}

/** Текстовое поле с задержкой: не дёргаем backend на каждую букву. */
function DebouncedInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const [debounced] = useDebouncedValue(text, 350);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- реагируем только на ввод
  }, [debounced]);
  return (
    <TextInput
      placeholder={label}
      aria-label={label}
      leftSection={<IconSearch size={14} />}
      value={text}
      onChange={(e) => setText(e.currentTarget.value)}
      w={170}
    />
  );
}

export function BoardFilters({ value, onChange, onlyMine, onOnlyMineChange }: Props) {
  const creatives = useUsers({ role: 'creative' });
  const buyers = useUsers({ role: 'buyer' });
  const set = (patch: Partial<TaskFilters>) => onChange({ ...value, ...patch });
  const userOptions = (list?: { id: number; full_name: string }[]) =>
    (list ?? []).map((u) => ({ value: String(u.id), label: u.full_name }));
  const activeCount = Object.values(value).filter(
    (v) => v !== undefined && v !== null && v !== '',
  ).length;
  // Сброс пересоздаёт текстовые поля — они очищаются без синхронизации через эффект
  const [resetKey, setResetKey] = useState(0);
  // На телефоне фильтры свёрнуты: иначе они занимают весь первый экран над карточками
  const isMobile = useIsMobile();
  const [opened, setOpened] = useState(false);

  const onlyMineSwitch = onOnlyMineChange && (
    <Switch
      size="md"
      label="Доступные только мне"
      checked={!!onlyMine}
      onChange={(e) => onOnlyMineChange(e.currentTarget.checked)}
    />
  );
  const resetButton = activeCount > 0 && (
    <Button
      variant="subtle"
      color="gray"
      size="xs"
      leftSection={<IconX size={14} />}
      onClick={() => {
        setResetKey((k) => k + 1);
        onChange({});
      }}
    >
      Сбросить
    </Button>
  );
  const fields = (
    <>
      <DebouncedInput
        key={`offer-${resetKey}`}
        label="Оффер"
        value={value.offer ?? ''}
        onChange={(offer) => set({ offer })}
      />
      <DebouncedInput
        key={`geo-${resetKey}`}
        label="GEO"
        value={value.geo ?? ''}
        onChange={(geo) => set({ geo })}
      />
      <Select
        placeholder="Исполнитель"
        aria-label="Исполнитель"
        data={userOptions(creatives.data)}
        value={value.assignee_id ? String(value.assignee_id) : null}
        onChange={(v) => set({ assignee_id: v ? Number(v) : null })}
        clearable
        searchable
        w={180}
      />
      <Select
        placeholder="Байер"
        aria-label="Байер"
        data={userOptions(buyers.data)}
        value={value.author_id ? String(value.author_id) : null}
        onChange={(v) => set({ author_id: v ? Number(v) : null })}
        clearable
        searchable
        w={170}
      />
      <Select
        placeholder="Приоритет"
        aria-label="Приоритет"
        data={toOptions(PRIORITY_LABELS)}
        value={value.priority ?? null}
        onChange={(v) => set({ priority: (v as Priority | null) ?? null })}
        clearable
        w={140}
      />
      <Switch
        size="md"
        label="Только просроченные"
        checked={!!value.overdue}
        onChange={(e) => set({ overdue: e.currentTarget.checked || undefined })}
      />
    </>
  );

  if (!isMobile) {
    return (
      <Group gap="xs" wrap="wrap">
        {fields}
        {onlyMineSwitch}
        {resetButton}
      </Group>
    );
  }

  // Телефон: кнопка «Фильтры (N)» и всегда видимый «Доступные только мне»; поля — под кнопкой
  return (
    <Stack gap="xs">
      <Group justify="space-between" gap="xs">
        <Button
          variant="light"
          size="sm"
          leftSection={<IconFilter size={16} />}
          aria-expanded={opened}
          onClick={() => setOpened((o) => !o)}
        >
          {activeCount ? `Фильтры (${activeCount})` : 'Фильтры'}
        </Button>
        {onlyMineSwitch}
      </Group>
      <Collapse expanded={opened}>
        <Group gap="xs" wrap="wrap">
          {fields}
          {resetButton}
        </Group>
      </Collapse>
    </Stack>
  );
}
