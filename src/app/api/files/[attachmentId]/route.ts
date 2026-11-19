import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { getActiveGrant } from '@/lib/access';
import { resolveStoragePath } from '@/lib/storage';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: { attachmentId: string } }) {
  return handle(async () => {
    const session = await requireUser();

    const attachment = await prisma.attachment.findUnique({
      where: { id: params.attachmentId },
      include: {
        consultation: {
          include: {
            doctor: { include: { user: { select: { id: true } } } },
            patient: { include: { user: { select: { id: true } } } },
          },
        },
      },
    });

    if (!attachment) throw new ApiError('NOT_FOUND', 404);

    const isAuthorDoctor =
      session.user.role === 'DOCTOR' && attachment.consultation.doctor.user.id === session.user.id;
    const isLinkedPatient =
      session.user.role === 'PATIENT' &&
      attachment.consultation.patient?.user.id === session.user.id;
    // Un médecin avec un grant FULL actif sur le patient propriétaire peut lire le fichier.
    let viaGrant = false;
    if (!isAuthorDoctor && !isLinkedPatient && session.user.role === 'DOCTOR') {
      const patientId = attachment.consultation.patientId;
      if (patientId && !attachment.consultation.hiddenByPatient) {
        const doctor = await prisma.doctor.findUnique({
          where: { userId: session.user.id },
          select: { id: true },
        });
        if (doctor) {
          const grant = await getActiveGrant(doctor.id, patientId);
          viaGrant = !!grant && grant.scope === 'FULL';
        }
      }
    }

    if (!isAuthorDoctor && !isLinkedPatient && !viaGrant) {
      throw new ApiError('FORBIDDEN', 403);
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(resolveStoragePath(attachment.storagePath));
    } catch {
      throw new ApiError('NOT_FOUND', 404);
    }

    const { searchParams } = new URL(request.url);
    const inline = searchParams.get('inline') === '1';
    const encoded = encodeURIComponent(attachment.fileName);

    await logAudit({
      userId: session.user.id,
      action: 'FILE_DOWNLOADED',
      entityType: 'Attachment',
      entityId: attachment.id,
      meta: {
        consultationId: attachment.consultation.id,
        patientId: attachment.consultation.patientId,
        viaGrant: viaGrant || undefined,
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(buffer.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
