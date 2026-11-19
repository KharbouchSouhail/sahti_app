'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch, errorCode } from '@/lib/client';

export function HideConsultationButton({
  consultationId,
  hidden,
}: {
  consultationId: string;
  hidden: boolean;
}) {
  const t = useTranslations('patient.detail');
  const tq = useTranslations('patient.consultations');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const result = await apiFetch<{ hidden: boolean }>(
        `/api/patient/consultations/${consultationId}/hide`,
        { method: 'PATCH', json: { hidden: !hidden } },
      );
      toast.success(result.hidden ? t('hideSuccess') : t('unhideSuccess'));
      router.refresh();
    } catch (error) {
      toast.error(te(errorCode(error) as 'GENERIC') ?? tc('error'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="md" onClick={toggle} disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : hidden ? (
        <Eye className="h-4 w-4" />
      ) : (
        <EyeOff className="h-4 w-4" />
      )}
      {hidden ? tq('unhide') : tq('hide')}
    </Button>
  );
}
