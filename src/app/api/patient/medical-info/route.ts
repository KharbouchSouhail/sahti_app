import { z } from 'zod';
import { handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentPatient } from '@/lib/roles';
import { logAudit } from '@/lib/audit';
import { BLOOD_TYPES } from '@/lib/constants';

export const runtime = 'nodejs';

const schema = z.object({
  bloodType: z
    .string()
    .refine((value) => value === '' || (BLOOD_TYPES as readonly string[]).includes(value), {
      message: 'Invalid blood type',
    })
    .optional(),
  allergies: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  chronicDiseases: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  birthDate: z.string().optional().nullable(),
  gender: z.enum(['M', 'F']).nullable().optional(),
});

export async function PATCH(request: Request) {
  return handle(async () => {
    const session = await requireUser('PATIENT');
    const patient = await currentPatient(session.user.id);
    const body = await parseJson(request, schema);

    let birthDate: Date | null | undefined;
    if (body.birthDate !== undefined) {
      if (body.birthDate === null || body.birthDate === '') {
        birthDate = null;
      } else {
        const parsed = new Date(body.birthDate);
        birthDate = Number.isNaN(parsed.getTime()) ? undefined : parsed;
      }
    }

    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: {
        bloodType: body.bloodType === '' ? null : body.bloodType,
        allergies: body.allergies,
        chronicDiseases: body.chronicDiseases,
        birthDate,
        gender: body.gender,
      },
      select: {
        bloodType: true,
        allergies: true,
        chronicDiseases: true,
        birthDate: true,
        gender: true,
      },
    });

    await logAudit({
      userId: session.user.id,
      action: 'MEDICAL_INFO_UPDATED',
      entityType: 'Patient',
      entityId: patient.id,
    });

    return updated;
  });
}
