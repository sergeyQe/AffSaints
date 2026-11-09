import { useMediaQuery } from '@mantine/hooks';

/** Узкий экран телефона (до брейкпоинта xs Mantine — 36em ≈ 576px). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 36em)') ?? false;
}
