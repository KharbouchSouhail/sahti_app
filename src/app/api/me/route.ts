import { z } from 'zod';
import { handle, parseJson, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

const schema = z.object({
  fullName: z.string().trim().min(3).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  locale: z.enum(['ar', 'fr']).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  specialty: z.string().trim().max(80).optional(),
  licenseNumber: z.string().trim().max(60).nullable().optional(),
  clinicName: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
});

export async function GET() {
  return handle(async () => {
    const session = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        locale: true,
        avatarUrl: true,
        createdAt: true,
        patient: {
          select: {
            id: true,
            patientCode: true,
            birthDate: true,
            gender: true,
            bloodType: true,
            allergies: true,
            chronicDiseases: true,
          },
        },
        doctor: {
          select: {
            id: true,
            specialty: true,
            licenseNumber: true,
            clinicName: true,
            city: true,
          },
        },
      },
    });
    if (!user) return null;
    await logAudit({ userId: session.user.id, action: 'PROFILE_VIEW' });
    return user;
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const session = await requireUser();
    const body = await parseJson(request, schema);

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        fullName: body.fullName,
        phone: body.phone,
        locale: body.locale,
        avatarUrl: body.avatarUrl,
        doctor:
          session.user.role === 'DOCTOR'
            ? {
                update: {
                  specialty: body.specialty,
                  licenseNumber: body.licenseNumber,
                  clinicName: body.clinicName,
                  city: body.city,
                },
              }
            : undefined,
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        locale: true,
        avatarUrl: true,
        doctor: {
          select: { specialty: true, licenseNumber: true, clinicName: true, city: true },
        },
      },
    });

    await logAudit({ userId: session.user.id, action: 'PROFILE_UPDATED', entityType: 'User', entityId: session.user.id });
    return user;
  });
}
