import { z } from 'zod';
import { ApiError, handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentPatient } from '@/lib/roles';
import { logAudit } from '@/lib/audit';

const schema = z.object({ hidden: z.boolean().optional() });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);
    const body = await parseJson(request, schema);

    const consultation = await prisma.consultation.findFirst({
      where: { id: params.id, patientId: patient.id },
      select: { id: true, hiddenByPatient: true },
    });
    if (!consultation) throw new ApiError('NOT_FOUND', 404);

    const hidden = body.hidden ?? !consultation.hiddenByPatient;
    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { hiddenByPatient: hidden },
    });

    await logAudit({
      userId: session.user.id,
      action: hidden ? 'CONSULTATION_HIDDEN' : 'CONSULTATION_SHOWN',
      entityType: 'Consultation',
      entityId: consultation.id,
    });

    return { hidden };
  });
}
