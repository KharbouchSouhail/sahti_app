'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CloudUpload,
  FileText,
  Loader2,
  Paperclip,
  Pill,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  UploadCloud,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea, Select, FieldError } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiFetch, errorCode } from '@/lib/client';
import { formatBytes } from '@/lib/files';
import { formatTime, toDateInputValue } from '@/lib/utils';
import { cn } from '@/lib/utils';

export type ConsultationAttachment = {
  id: string;
  fileName: string;
  sizeBytes: number;
  kind: string;
};

export type ConsultationFormInitial = {
  id?: string;
  reason: string;
  symptoms: string;
  examination: string;
  diagnosis: string;
  treatment: string;
  recommendations: string;
  followUpDate: string | null;
  prescriptions: Array<{
    medication: string;
    dosage: string;
    frequency: string;
    duration: string;
    notes: string;
  }>;
  attachments: ConsultationAttachment[];
};

type Fields = {
  reason: string;
  symptoms: string;
  examination: string;
  diagnosis: string;
  treatment: string;
  recommendations: string;
  followUpDate: string;
};

type PrescriptionRow = {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes: string;
};

const EMPTY_ROW: PrescriptionRow = {
  medication: '',
  dosage: '',
  frequency: '',
  duration: '',
  notes: '',
};

const STEPS = ['reason', 'exam', 'treatment', 'review'] as const;

export function ConsultationForm({
  initial,
  pendingPatient,
}: {
  initial?: ConsultationFormInitial;
  pendingPatient?: { patientId: string; patientName: string } | null;
}) {
  const t = useTranslations('doctor.form');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    if (pendingPatient) {
      sessionStorage.setItem('sehhati.pendingPatient', JSON.stringify(pendingPatient));
    }
  }, [pendingPatient]);

  const [consultationId, setConsultationId] = useState<string | null>(initial?.id ?? null);
  const idRef = useRef<string | null>(initial?.id ?? null);
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<Fields>({
    reason: initial?.reason ?? '',
    symptoms: initial?.symptoms ?? '',
    examination: initial?.examination ?? '',
    diagnosis: initial?.diagnosis ?? '',
    treatment: initial?.treatment ?? '',
    recommendations: initial?.recommendations ?? '',
    followUpDate: toDateInputValue(initial?.followUpDate),
  });
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>(
    initial?.prescriptions.length
      ? initial.prescriptions
      : [{ ...EMPTY_ROW }],
  );
  const [attachments, setAttachments] = useState<ConsultationAttachment[]>(initial?.attachments ?? []);
  const [kind, setKind] = useState('LAB');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const update = (key: keyof Fields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  function updatePrescription(index: number, key: keyof PrescriptionRow, value: string) {
    setPrescriptions((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
    setDirty(true);
  }

  const payload = useCallback(() => {
    const cleanedPrescriptions = prescriptions
      .filter(
        (row) =>
          row.medication.trim() &&
          row.dosage.trim() &&
          row.frequency.trim() &&
          row.duration.trim(),
      )
      .map((row) => ({
        medication: row.medication.trim(),
        dosage: row.dosage.trim(),
        frequency: row.frequency.trim(),
        duration: row.duration.trim(),
        notes: row.notes.trim() || null,
      }));

    return {
      reason: fields.reason.trim(),
      symptoms: fields.symptoms.trim() || null,
      examination: fields.examination.trim() || null,
      diagnosis: fields.diagnosis.trim() || null,
      treatment: fields.treatment.trim() || null,
      recommendations: fields.recommendations.trim() || null,
      followUpDate: fields.followUpDate || null,
      prescriptions: cleanedPrescriptions,
    };
  }, [fields, prescriptions]);

  const ensureDraft = useCallback(async () => {
    if (idRef.current) return idRef.current;
    const created = await apiFetch<{ id: string }>('/api/doctor/consultations', {
      method: 'POST',
      json: { reason: fields.reason.trim(), symptoms: fields.symptoms.trim() || undefined },
    });
    idRef.current = created.id;
    setConsultationId(created.id);
    return created.id;
  }, [fields.reason, fields.symptoms]);

  const saveDraft = useCallback(async () => {
    if (savingRef.current) return;
    const hasContent =
      Object.values(fields).some((value) => value.trim().length > 0) ||
      prescriptions.some((row) => Object.values(row).some((value) => value.trim().length > 0));
    if (!idRef.current && !hasContent) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const id = await ensureDraft();
      await apiFetch(`/api/doctor/consultations/${id}`, {
        method: 'PATCH',
        json: payload(),
      });
      setSavedAt(new Date());
      setDirty(false);
      setError(null);
    } catch (err) {
      const code = errorCode(err);
      if (code === 'COMPLETE_REQUIRED' || code === 'CONSULTATION_NOT_LINKABLE') {
        setError(te(code as 'GENERIC'));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [ensureDraft, fields, payload, prescriptions, te]);

  // Sauvegarde automatique (debounce 1,4 s)
  useEffect(() => {
    if (!dirty) return;
    const timeout = setTimeout(() => {
      void saveDraft();
    }, 1400);
    return () => clearTimeout(timeout);
  }, [dirty, fields, prescriptions, saveDraft]);

  // Sauvegarde périodique toutes les 15 s
  useEffect(() => {
    const interval = setInterval(() => {
      if (dirtyRef.current) void saveDraft();
    }, 15000);
    return () => clearInterval(interval);
  }, [saveDraft]);

  async function uploadFile(file: File) {
    if (attachments.length >= 5) return;
    setUploading(true);
    try {
      const id = await ensureDraft();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);
      const response = await fetch(`/api/doctor/consultations/${id}/attachments`, {
        method: 'POST',
        body: formData,
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.error?.code ?? 'GENERIC');
      }
      setAttachments((prev) => [...prev, json.data]);
      toast.success(t('uploadSuccess'));
    } catch (err) {
      const message = err instanceof Error && err.message === 'FILE_TOO_LARGE'
        ? te('FILE_TOO_LARGE')
        : err instanceof Error && err.message === 'FILE_TYPE'
          ? te('FILE_TYPE')
          : t('uploadError');
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    if (!consultationId) return;
    try {
      await apiFetch(`/api/doctor/consultations/${consultationId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
      setAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
    } catch {
      toast.error(tc('error'));
    }
  }

  function validateForFinish() {
    if (!fields.reason.trim()) {
      toast.error(t('requiredFields'));
      setStep(0);
      return false;
    }
    if (!fields.diagnosis.trim()) {
      toast.error(t('requiredFields'));
      setStep(1);
      return false;
    }
    if (!fields.treatment.trim() && !fields.recommendations.trim()) {
      toast.error(t('requiredFields'));
      setStep(2);
      return false;
    }
    const incomplete = prescriptions.some(
      (row) =>
        Object.values(row).some((value) => value.trim().length > 0) &&
        !(row.medication.trim() && row.dosage.trim() && row.frequency.trim() && row.duration.trim()),
    );
    if (incomplete) {
      toast.error(t('incompletePrescription'));
      setStep(2);
      return false;
    }
    return true;
  }

  async function finish() {
    if (!validateForFinish()) return;
    setFinishing(true);
    setError(null);
    try {
      const id = await ensureDraft();
      await apiFetch(`/api/doctor/consultations/${id}`, { method: 'PATCH', json: payload() });
      await apiFetch(`/api/doctor/consultations/${id}/complete`, { method: 'POST' });
      router.push(`/${locale}/doctor/consultations/${id}/finish`);
      router.refresh();
    } catch (err) {
      const code = errorCode(err);
      if (code === 'COMPLETE_REQUIRED') {
        setError(te('COMPLETE_REQUIRED'));
        toast.error(te('COMPLETE_REQUIRED'));
      } else {
        toast.error(te(code as 'GENERIC') ?? t('completeError'));
      }
      setFinishing(false);
    }
  }

  const stepKey = STEPS[step];
  const isEditing = Boolean(initial?.id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/${locale}/doctor/consultations`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-primary-700"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          {tc('back')}
        </Link>
        <div className="flex items-center gap-2 text-[10px] font-medium text-ink-400">
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-500" />
              {t('savingDraft')}
            </>
          ) : savedAt ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              {t('savedAt', { time: formatTime(savedAt, locale) })}
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              {t('autoSave')}
            </>
          )}
        </div>
      </div>

      <div className="rounded-[30px] bg-white p-4 shadow-card ring-1 ring-line/70 sm:p-6">
        {/* Stepper */}
        <div className="flex items-center gap-1 sm:gap-2">
          {STEPS.map((key, index) => {
            const active = step === index;
            const done = step > index;
            return (
              <div key={key} className="flex flex-1 items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-2 text-start transition-colors sm:px-3',
                    active ? 'bg-primary-50' : 'hover:bg-primary-50/60',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[11px] font-bold transition-colors',
                      active
                        ? 'bg-primary-600 text-white shadow-soft'
                        : done
                          ? 'bg-[#E9F6F1] text-success'
                          : 'bg-primary-50 text-ink-400',
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      'hidden truncate text-[11px] font-semibold sm:block',
                      active ? 'text-primary-700' : 'text-ink-400',
                    )}
                  >
                    {t(`steps.${key}`)}
                  </span>
                </button>
                {index < STEPS.length - 1 ? <span className="h-px w-2 shrink-0 bg-line sm:w-4" /> : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <div>
            <p className="text-lg font-bold">
              {isEditing ? t('editTitle') : t('newTitle')}
            </p>
            <p className="text-[11px] text-ink-400">{t(`steps.${stepKey}`)}</p>
          </div>
          <Badge variant="violet">{t('stepOf', { current: step + 1, total: 4 })}</Badge>
        </div>

        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#FDECEC] px-4 py-3 text-xs font-medium text-danger">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="mt-5 min-h-[300px]">
          {step === 0 ? (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label htmlFor="reason" required>
                  {t('reasonLabel')}
                </Label>
                <Input
                  id="reason"
                  value={fields.reason}
                  onChange={(event) => update('reason', event.target.value)}
                  placeholder={t('reasonPlaceholder')}
                />
                <FieldError>{!fields.reason.trim() ? t('requiredMark') : undefined}</FieldError>
              </div>
              <div>
                <Label htmlFor="symptoms">{t('symptoms')}</Label>
                <Textarea
                  id="symptoms"
                  value={fields.symptoms}
                  onChange={(event) => update('symptoms', event.target.value)}
                  placeholder={t('symptomsPlaceholder')}
                />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label htmlFor="examination">{t('examination')}</Label>
                <Textarea
                  id="examination"
                  value={fields.examination}
                  onChange={(event) => update('examination', event.target.value)}
                  placeholder={t('examinationPlaceholder')}
                />
              </div>
              <div>
                <Label htmlFor="diagnosis" required>
                  {t('diagnosis')}
                </Label>
                <Textarea
                  id="diagnosis"
                  value={fields.diagnosis}
                  onChange={(event) => update('diagnosis', event.target.value)}
                  placeholder={t('diagnosisPlaceholder')}
                />
                <FieldError>{!fields.diagnosis.trim() ? t('requiredMark') : undefined}</FieldError>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5 animate-fade-in">
              <div>
                <Label htmlFor="treatment">{t('treatmentLabel')}</Label>
                <Textarea
                  id="treatment"
                  value={fields.treatment}
                  onChange={(event) => update('treatment', event.target.value)}
                  placeholder={t('treatmentPlaceholder')}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink-700">{t('prescriptions')}</p>
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    onClick={() => setPrescriptions((prev) => [...prev, { ...EMPTY_ROW }])}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('addPrescription')}
                  </Button>
                </div>

                <div className="space-y-3">
                  {prescriptions.map((row, index) => (
                    <div
                      key={index}
                      className="rounded-2xl bg-primary-50/50 p-3 ring-1 ring-primary-100/60"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary-600">
                          <Pill className="h-3 w-3" />
                          #{index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPrescriptions((prev) =>
                              prev.length === 1 ? [{ ...EMPTY_ROW }] : prev.filter((_, i) => i !== index),
                            );
                            setDirty(true);
                          }}
                          className="grid h-7 w-7 place-items-center rounded-full text-ink-400 hover:bg-white hover:text-danger"
                          aria-label={t('removePrescription')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Input
                            value={row.medication}
                            onChange={(event) => updatePrescription(index, 'medication', event.target.value)}
                            placeholder={t('medicationPlaceholder')}
                            className="h-10 bg-white py-2 text-xs"
                          />
                        </div>
                        <Input
                          value={row.dosage}
                          onChange={(event) => updatePrescription(index, 'dosage', event.target.value)}
                          placeholder={t('dosagePlaceholder')}
                          className="h-10 bg-white py-2 text-xs"
                        />
                        <Input
                          value={row.frequency}
                          onChange={(event) => updatePrescription(index, 'frequency', event.target.value)}
                          placeholder={t('frequencyPlaceholder')}
                          className="h-10 bg-white py-2 text-xs"
                        />
                        <Input
                          value={row.duration}
                          onChange={(event) => updatePrescription(index, 'duration', event.target.value)}
                          placeholder={t('durationPlaceholder')}
                          className="h-10 bg-white py-2 text-xs"
                        />
                        <Input
                          value={row.notes}
                          onChange={(event) => updatePrescription(index, 'notes', event.target.value)}
                          placeholder={t('notesPlaceholder')}
                          className="h-10 bg-white py-2 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label htmlFor="recommendations">{t('recommendations')}</Label>
                  <Textarea
                    id="recommendations"
                    value={fields.recommendations}
                    onChange={(event) => update('recommendations', event.target.value)}
                    placeholder={t('recommendationsPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="followUp">{t('followUpDate')}</Label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                    <Input
                      id="followUp"
                      type="date"
                      value={fields.followUpDate}
                      onChange={(event) => update('followUpDate', event.target.value)}
                      className="ps-11 sm:w-[190px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4 animate-fade-in">
              <div className="rounded-2xl bg-primary-50/60 p-4 ring-1 ring-primary-100/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{t('attachments')}</p>
                    <p className="text-[10px] text-ink-400">{t('dropzoneHint')}</p>
                  </div>
                  <Badge variant="gray">{attachments.length}/5</Badge>
                </div>

                <label
                  className={cn(
                    'mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary-200 bg-white/70 px-4 py-7 text-center transition-colors hover:border-primary-300 hover:bg-white',
                    (uploading || attachments.length >= 5) && 'pointer-events-none opacity-60',
                  )}
                >
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void uploadFile(file);
                    }}
                    disabled={uploading || attachments.length >= 5}
                  />
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                  ) : (
                    <UploadCloud className="h-6 w-6 text-primary-500" />
                  )}
                  <p className="mt-2 text-xs font-semibold text-ink-700">
                    {uploading ? t('uploading') : t('dropzoneTitle')}
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-400">{t('dropzoneHint')}</p>
                </label>

                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-ink-500">{t('kind')}</span>
                  <Select
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                    className="h-9 w-auto min-w-[140px] py-1 text-xs"
                  >
                    <option value="LAB">{t('kindLAB')}</option>
                    <option value="IMAGING">{t('kindIMAGING')}</option>
                    <option value="PRESCRIPTION">{t('kindPRESCRIPTION')}</option>
                    <option value="OTHER">{t('kindOTHER')}</option>
                  </Select>
                </div>

                {attachments.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {attachments.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-2.5 rounded-xl bg-white p-2.5 ring-1 ring-line"
                      >
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-50 text-primary-600">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold text-ink-900">{file.fileName}</p>
                          <p className="text-[9px] text-ink-400">{formatBytes(file.sizeBytes)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(file.id)}
                          className="grid h-7 w-7 place-items-center rounded-full text-ink-400 hover:bg-[#FDECEC] hover:text-danger"
                          aria-label={t('removeFile')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">{t('summary')}</p>
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="text-[10px] font-semibold text-primary-600 hover:text-primary-800"
                  >
                    {t('prevStep')}
                  </button>
                </div>
                <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                  <div className="rounded-xl bg-primary-50/60 p-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">
                      {t('reasonLabel')}
                    </p>
                    <p className="mt-0.5 font-semibold text-ink-900">{fields.reason || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-accent-50 p-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-accent-600/70">
                      {t('diagnosis')}
                    </p>
                    <p className="mt-0.5 font-semibold text-ink-900">{fields.diagnosis || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-[#E9F6F1] p-2.5">
                    <Pill className="h-3.5 w-3.5 text-success" />
                    <span className="font-semibold text-ink-700">
                      {t('prescriptionCount', { count: prescriptions.filter((p) => p.medication.trim()).length })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-primary-50 p-2.5">
                    <Paperclip className="h-3.5 w-3.5 text-primary-500" />
                    <span className="font-semibold text-ink-700">
                      {t('attachmentsCount', { count: attachments.length })}
                    </span>
                  </div>
                </div>
                <p className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-ink-400">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                  {t('finishHint')}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setStep((prev) => Math.max(0, prev - 1))}
              disabled={step === 0}
            >
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              {t('prevStep')}
            </Button>
            <button
              type="button"
              onClick={() => {
                setDirty(true);
                void saveDraft();
              }}
              className="text-[10px] font-semibold text-ink-400 hover:text-primary-600"
              disabled={saving}
            >
              {tc('save')}
            </button>
          </div>

          {step < 3 ? (
            <Button type="button" variant="violet" size="md" onClick={() => setStep((prev) => prev + 1)}>
              {t('nextStep')}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
          ) : (
            <Button type="button" variant="primary" size="lg" onClick={finish} disabled={finishing}>
              {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {finishing ? t('finishing') : t('finish')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
