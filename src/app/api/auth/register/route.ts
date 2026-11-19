import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, handle, parseJson } from '@/lib/api';
import { logAudit } from '@/lib/audit';
import { clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const schema = z
  .object({
    role: z.enum(['PATIENT', 'DOCTOR']),
    fullName: z.string().trim().min(3).max(80),
    email: z.string().trim().email().max(160),
    password: z.string().min(8).max(100),
    phone: z.string().trim().max(30).optional(),
    locale: z.enum(['ar', 'fr']).default('ar'),
    specialty: z.string().trim().max(80).optional(),
    licenseNumber: z.string().trim().max(60).optional(),
    clinicName: z.string().trim().max(120).optional(),
    city: z.string().trim().max(80).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'DOCTOR' && !data.specialty) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['specialty'], message: 'Specialty is required' });
    }
  });

async function generatePatientCode() {
  for (let attempt = 0; attempt < 15; attempt++) {
    const code = `SH-${Math.floor(100000 + Math.random() * 900000)}`;
    const exists = await prisma.patient.findUnique({ where: { patientCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new ApiError('GENERIC', 500);
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  return handle(async () => {
    const body = await parseJson(request, schema);
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ApiError('EMAIL_EXISTS', 409);

    const passwordHash = await bcrypt.hash(body.password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: body.role === 'DOCTOR' ? Role.DOCTOR : Role.PATIENT,
        fullName: body.fullName,
        phone: body.phone || null,
        locale: body.locale,
        patient:
          body.role === 'PATIENT'
            ? { create: { patientCode: await generatePatientCode() } }
            : undefined,
        doctor:
          body.role === 'DOCTOR'
            ? {
                create: {
                  specialty: body.specialty ?? 'Médecine générale',
                  licenseNumber: body.licenseNumber || null,
                  clinicName: body.clinicName || null,
                  city: body.city || null,
                },
              }
            : undefined,
      },
      select: { id: true, role: true, fullName: true },
    });

    await logAudit({
      userId: user.id,
      action: 'REGISTER',
      entityType: 'User',
      entityId: user.id,
      ip,
      meta: { role: body.role },
    });

    return { id: user.id, role: user.role, fullName: user.fullName };
  });
}
