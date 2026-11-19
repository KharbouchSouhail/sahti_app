import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { FileText } from 'lucide-react';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ConsultationForm } from '@/components/doctor/consultation-form';

export const dynamic = 'force-dynamic';

export default async function EditConsultationPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'doctor.form' });
  const td = await getTranslations({ locale, namespace: 'doctor.detail' });
  const data = await getSessionUser();
  const doctor = data!.user.doctor!;

  const consultation = await prisma.consultation.findFirst({
    where: { id, doctorId: doctor.id },
    include: {
      prescriptions: { orderBy: { position: 'asc' } },
      attachments: {
        select: { id: true, fileName: true, sizeBytes: true, kind: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!consultation) {
    return (
      <div className="animate-fade-up">
        <EmptyState
          icon={<FileText />}
          title={td('title')}
          body={td('completeFirst')}
          action={
            <Link href={`/${locale}/doctor/consultations`} className="btn-violet">
              {td('back')}
            </Link>
          }
        />
      </div>
    );
  }

  if (consultation.status === 'LINKED') {
    redirect(`/${locale}/doctor/consultations/${consultation.id}`);
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title={t('editTitle')} subtitle={t('editSubtitle')} />
      <ConsultationForm
        initial={{
          id: consultation.id,
          reason: consultation.reason,
          symptoms: consultation.symptoms ?? '',
          examination: consultation.examination ?? '',
          diagnosis: consultation.diagnosis ?? '',
          treatment: consultation.treatment ?? '',
          recommendations: consultation.recommendations ?? '',
          followUpDate: consultation.followUpDate ? consultation.followUpDate.toISOString() : null,
          prescriptions: consultation.prescriptions.map((row) => ({
            medication: row.medication,
            dosage: row.dosage,
            frequency: row.frequency,
            duration: row.duration,
            notes: row.notes ?? '',
          })),
          attachments: consultation.attachments,
        }}
      />
    </div>
  );
}
