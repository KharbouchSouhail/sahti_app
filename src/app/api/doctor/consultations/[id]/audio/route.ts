import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { ownedConsultation } from '@/lib/ai/access';
import { resolveRecordingPath } from '@/lib/recording-storage';
import { deleteRecordingNow } from '@/lib/retention';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    await ownedConsultation(params.id, doctor.id);

    const recording = await prisma.recording.findUnique({
      where: { consultationId: params.id },
    });
    if (!recording || !recording.storagePath || recording.deletedAt) {
      throw new ApiError('AUDIO_DELETED', 410);
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(resolveRecordingPath(recording.storagePath));
    } catch {
      throw new ApiError('AUDIO_DELETED', 410);
    }

    const range = request.headers.get('range');
    let status = 200;
    let body: Uint8Array = new Uint8Array(buffer);
    const headers: Record<string, string> = {
      'Content-Type': recording.mimeType || 'audio/webm',
      'Content-Disposition': 'inline; filename="consultation.webm"',
      'Cache-Control': 'private, no-store',
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    };

    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), buffer.length - 1) : buffer.length - 1;
        if (start <= end && start < buffer.length) {
          body = new Uint8Array(buffer.subarray(start, end + 1));
          status = 206;
          headers['Content-Range'] = `bytes ${start}-${end}/${buffer.length}`;
          headers['Content-Length'] = String(body.length);
        }
      }
    }
    if (!headers['Content-Length']) headers['Content-Length'] = String(body.length);

    await logAudit({
      userId: session.user.id,
      action: 'AUDIO_PLAYED',
      entityType: 'Consultation',
      entityId: params.id,
      meta: { recordingId: recording.id, range: Boolean(range) },
    });

    return new NextResponse(body, { status, headers });
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    await ownedConsultation(params.id, doctor.id);

    const result = await deleteRecordingNow(params.id, {
      userId: session.user.id,
      reason: 'MANUAL',
    });

    return { deleted: result.deleted };
  });
}
