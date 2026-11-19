export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

type ApiResponse<T> = { data: T } | { error: { code: string; message: string } };

export async function apiFetch<T>(
  url: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || 'error' in payload) {
    const code = payload && 'error' in payload ? payload.error.code : 'GENERIC';
    const message = payload && 'error' in payload ? payload.error.message : response.statusText;
    throw new ApiClientError(code, response.status, message);
  }

  return payload.data;
}

export function errorCode(error: unknown) {
  if (error instanceof ApiClientError) return error.code;
  return 'GENERIC';
}
