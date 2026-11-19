import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { saveUpload, sanitizeFileName } from '@/lib/storage';
import { logAudit } from '@/lib/audit';
import { ATTACHMENT_KINDS } from '@/lib/constants';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);

    const consultation = await prisma.consultation.findFirst({
      where: { id: params.id, doctorId: doctor.id },
      select: { id: true, status: true, _count: { select: { attachments: true } } },
    });
    if (!consultation) throw new ApiError('NOT_FOUND', 404);
    if (consultation.status === 'LINKED') throw new ApiError('CONSULTATION_NOT_LINKABLE', 409);
    if (consultation._count.attachments >= 5) {
      throw new ApiError('VALIDATION', 422, 'Too many attachments');
    }

    const form = await request.formData();
    const file = form.get('file');
    const kindValue = String(form.get('kind') ?? 'OTHER');
    if (!(file instanceof File)) throw new ApiError('FILE_TYPE', 415);
    const kind = (ATTACHMENT_KINDS as readonly string[]).includes(kindValue) ? kindValue : 'OTHER';

    const saved = await saveUpload(file);

    const attachment = await prisma.attachment.create({
      data: {
        consultationId: consultation.id,
        fileName: sanitizeFileName(saved.fileName),
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        storagePath: saved.storagePath,
        kind,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        kind: true,
        createdAt: true,
      },
    });

    await logAudit({
      userId: session.user.id,
      action: 'FILE_UPLOADED',
      entityType: 'Consultation',
      entityId: consultation.id,
      meta: { attachmentId: attachment.id, kind },
    });

    return attachment;
  });
}
