/** Ошибка API в едином формате backend: {"error": {"code", "message", "details"}}. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: { field: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: { field: string; message: string }[],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  // Пустые значения фильтров в строку запроса не попадают
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

async function parseError(resp: Response): Promise<ApiError> {
  try {
    const data = (await resp.json()) as {
      error?: { code?: string; message?: string; details?: { field: string; message: string }[] };
    };
    if (data.error) {
      return new ApiError(
        resp.status,
        data.error.code ?? 'unknown',
        data.error.message ?? 'Ошибка запроса',
        data.error.details,
      );
    }
  } catch {
    // тело не JSON — ниже вернём общую ошибку
  }
  return new ApiError(resp.status, 'unknown', `Ошибка сервера (${resp.status})`);
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const isForm = body instanceof FormData;

  const resp = await fetch(buildUrl(path, query), {
    method,
    signal,
    credentials: 'same-origin',
    headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (!resp.ok) throw await parseError(resp);
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}
