import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema, type z } from 'zod';
import type { Role } from '@prisma/client';
import { auth } from '@/lib/auth';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

type ErrorPayload = {
  error: { code: string; message: string };
};

function errorResponse(code: string, status: number, message?: string, details?: unknown) {
  return NextResponse.json<ErrorPayload>(
    { error: { code, message: message ?? code } },
    { status },
  );
}

export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    if (data instanceof NextResponse) return data;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error.code, error.status, error.message);
    }
    if (error instanceof ZodError) {
      const first = error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: first?.message ?? 'Invalid payload',
            issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
        },
        { status: 422 },
      );
    }
    console.error('[api]', error);
    return errorResponse('GENERIC', 500, 'Unexpected server error');
  }
}

export async function requireUser(role?: Role) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError('UNAUTHORIZED', 401);
  }
  if (role && session.user.role !== role) {
    throw new ApiError('FORBIDDEN', 403);
  }
  return session;
}

export async function parseJson<S extends ZodSchema>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid JSON body');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

export function notFound(code = 'NOT_FOUND') {
  throw new ApiError(code, 404);
}
