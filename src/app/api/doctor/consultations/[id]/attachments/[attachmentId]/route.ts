import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { deleteUpload } from '@/lib/storage';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; attachmentId: string } },
) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);

    const attachment = await prisma.attachment.findFirst({
      where: {
        id: params.attachmentId,
        consultationId: params.id,
        consultation: { doctorId: doctor.id, status: { not: 'LINKED' } },
      },
      select: { id: true, storagePath: true, consultationId: true },
    });
    if (!attachment) throw new ApiError('NOT_FOUND', 404);

    await prisma.attachment.delete({ where: { id: attachment.id } });
    await deleteUpload(attachment.storagePath);

    await logAudit({
      userId: session.user.id,
      action: 'FILE_DELETED',
      entityType: 'Attachment',
      entityId: attachment.id,
    });

    return { ok: true };
  });
}
