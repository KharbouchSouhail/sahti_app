import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export async function ownedConsultation(id: string, doctorId: string) {
  const consultation = await prisma.consultation.findFirst({
    where: { id, doctorId },
    select: {
      id: true,
      status: true,
      reason: true,
      patientId: true,
      creationMode: true,
      aiMeta: true,
      consultedAt: true,
      validatedAt: true,
    },
  });
  if (!consultation) throw new ApiError('NOT_FOUND', 404);
  return consultation;
}
