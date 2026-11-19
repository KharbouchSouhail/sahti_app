import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export async function currentPatient(userId: string) {
  const patient = await prisma.patient.findUnique({ where: { userId } });
  if (!patient) throw new ApiError('NOT_FOUND', 404);
  return patient;
}

export async function currentDoctor(userId: string) {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new ApiError('NOT_FOUND', 404);
  return doctor;
}
