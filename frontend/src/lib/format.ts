/** Кредиты: «1 234,5». */
export const formatCredits = (n: number) =>
  n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Размер файла: «340 КБ», «12.4 МБ». */
export function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** Инициалы для аватара: «Иван Петров» → «ИП». */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Ссылка безопасна для href: только http(s) и не пустая после схемы. */
export const isHttpUrl = (url: string) => /^https?:\/\/\S{3,}$/i.test(url.trim());
