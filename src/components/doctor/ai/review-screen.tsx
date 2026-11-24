'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Pause,
  PencilLine,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { apiFetch, errorCode } from '@/lib/client';
import { validateReview, type ReviewPayload } from '@/lib/ai/review';
import {
  EXTRACTION_FIELDS,
  type ExtractionField,
  type ExtractionWarning,
  type UncertainPassage,
} from '@/lib/ai/types';
import { cn, formatCountdown } from '@/lib/utils';

type Segment = {
  id: string;
  start: number;
  end: number;
  speaker: 'DOCTOR' | 'PATIENT' | 'UNKNOWN';
  text: string;
};

type PrescriptionRow = {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes: string;
  confirmed: boolean;
  evidence: string[];
};

export type ReviewDraft = {
  fields: Record<ExtractionField, string>;
  prescriptions: PrescriptionRow[];
  missingFields: string[];
  unverifiedFields: string[];
  warnings: ExtractionWarning[];
  uncertainPassages: UncertainPassage[];
  fieldSources: Record<string, string[]>;
  provider: string;
  model: string | null;
  promptVersion: string;
  language: string;
};

const EMPTY_ROW: PrescriptionRow = {
  medication: '',
  dosage: '',
  frequency: '',
  duration: '',
  notes: '',
  confirmed: false,
  evidence: [],
};

export function ReviewScreen({
  consultationId,
  locale,
  audioAvailable: initialAudioAvailable,
  transcript,
  draft,
}: {
  consultationId: string;
  locale: string;
  audioAvailable: boolean;
  transcript: { language: string; segments: Segment[] } | null;
  draft: ReviewDraft;
}) {
  const t = useTranslations('doctor.ai.review');
  const router = useRouter();

  const [audioPresent, setAudioPresent] = useState(initialAudioAvailable);
  const [deletingAudio, setDeletingAudio] = useState(false);

  const [fields, setFields] = useState<Record<ExtractionField, string>>({ ...draft.fields });
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>(
    draft.prescriptions.length > 0 ? draft.prescriptions : [],
  );
  const [sources, setSources] = useState<Record<string, string[]>>({ ...draft.fieldSources });
  const [unverified, setUnverified] = useState<Set<string>>(new Set(draft.unverifiedFields));
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<ExtractionField | null>(null);
  const [mobileTab, setMobileTab] = useState<'transcript' | 'draft'>('draft');
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const initialFields = draft.fields;

  const edited = useMemo(() => {
    const set = new Set<ExtractionField>();
    for (const field of EXTRACTION_FIELDS) {
      if ((fields[field] ?? '').trim() !== (initialFields[field] ?? '').trim()) {
        set.add(field);
      }
    }
    return set;
  }, [fields, initialFields]);

  const prescriptionsEdited = useMemo(
    () =>
      JSON.stringify(prescriptions.map(({ medication, dosage, frequency, duration, notes }) => ({ medication, dosage, frequency, duration, notes }))) !==
      JSON.stringify(
        draft.prescriptions.map(({ medication, dosage, frequency, duration, notes }) => ({ medication, dosage, frequency, duration, notes })),
      ),
    [prescriptions, draft.prescriptions],
  );

  const payload = (): ReviewPayload => ({
    fields,
    prescriptions: prescriptions.map((row) => ({
      medication: row.medication,
      dosage: row.dosage,
      frequency: row.frequency,
      duration: row.duration,
      notes: row.notes || null,
      confirmed: row.confirmed,
    })),
    reviewed,
  });

  function setField(field: ExtractionField, value: string) {
    setFields((previous) => ({ ...previous, [field]: value }));
    setUnverified((previous) => {
      if (!previous.has(field)) return previous;
      const next = new Set(previous);
      next.delete(field);
      return next;
    });
  }

  function seek(segment: Segment) {
    setActiveSegment(segment.id);
    if (!audioPresent || !audioRef.current) return;
    audioRef.current.currentTime = segment.start;
    void audioRef.current.play().catch(() => undefined);
    setPlaying(true);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => undefined);
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  async function deleteAudio() {
    if (deletingAudio) return;
    setDeletingAudio(true);
    try {
      const result = await apiFetch<{ deleted: boolean }>(
        `/api/doctor/consultations/${consultationId}/audio`,
        { method: 'DELETE' },
      );
      if (result.deleted) {
        setAudioPresent(false);
        toast.success(t('audioDeletedNow'));
      }
    } catch {
      toast.error(t('audioDeleteError'));
    } finally {
      setDeletingAudio(false);
    }
  }

  function showSource(field: ExtractionField) {
    const ids = sources[field] ?? [];
    if (ids.length === 0) return;
    setHighlightIds(ids);
    setMobileTab('transcript');
    const first = document.getElementById(`segment-${ids[0]}`);
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (audioPresent && audioRef.current && transcript) {
      const segment = transcript.segments.find((item) => item.id === ids[0]);
      if (segment) seek(segment);
    }
  }

  async function regenerate(field: ExtractionField) {
    if (regenerating) return;
    setRegenerating(field);
    try {
      const result = await apiFetch<{
        value: string;
        evidence: string[];
        unverified: boolean;
      }>(`/api/doctor/consultations/${consultationId}/regenerate`, {
        method: 'POST',
        json: { field },
      });
      setField(field, result.value);
      setSources((previous) => ({ ...previous, [field]: result.evidence }));
      setUnverified((previous) => {
        const next = new Set(previous);
        if (result.unverified) next.add(field);
        else next.delete(field);
        return next;
      });
      toast.success(t('regenerated'));
    } catch (err) {
      const code = errorCode(err);
      toast.error(code === 'RATE_LIMITED' ? t('regenerateLimit') : t('regenerateError'));
    } finally {
      setRegenerating(null);
    }
  }

  function updateRow(index: number, patch: Partial<PrescriptionRow>) {
    setPrescriptions((previous) =>
      previous.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  async function saveDraft() {
    if (saving) return;
    setSaving(true);
    try {
      await apiFetch(`/api/doctor/consultations/${consultationId}/review`, {
        method: 'POST',
        json: payload(),
      });
      setSavedAt(new Date().toISOString());
      toast.success(t('saved'));
    } catch {
      toast.error(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function validate() {
    if (validating) return;
    const errors = validateReview(payload());
    if (errors.length > 0) {
      toast.error(t(`errors.${errors[0]}`));
      return;
    }
    setValidating(true);
    try {
      await apiFetch(`/api/doctor/consultations/${consultationId}/validate`, {
        method: 'POST',
        json: payload(),
      });
      toast.success(t('validated'));
      router.push(`/${locale}/doctor/consultations/${consultationId}/finish`);
      router.refresh();
    } catch (err) {
      const code = errorCode(err);
      const known = [
        'REVIEW_REQUIRED',
        'COMPLETE_REQUIRED',
        'PRESCRIPTION_INCOMPLETE',
        'PRESCRIPTION_UNCONFIRMED',
        'INVALID_DATE',
      ];
      toast.error(known.includes(code) ? t(`errors.${code}`) : t('validateError'));
    } finally {
      setValidating(false);
    }
  }

  const sourceCount = (field: ExtractionField) => (sources[field] ?? []).length;
  const isMissing = (field: ExtractionField) => !(fields[field] ?? '').trim();

  const fieldCard = (field: ExtractionField) => {
    const value = fields[field] ?? '';
    const isEdited = edited.has(field);
    const missing = isMissing(field);
    const flagged = unverified.has(field);
    const multiline = field !== 'reason' && field !== 'followUpDate';
    return (
      <div
        key={field}
        className={cn(
          'rounded-2xl border p-3.5 transition-colors',
          missing
            ? 'border-[#F3D9A4] bg-[#FDF9EF]'
            : flagged
              ? 'border-[#F3D9A4] bg-[#FEFBF4]'
              : 'border-line bg-white',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Label htmlFor={`field-${field}`} className="mb-0">
              {t(`fields.${field}`)}
            </Label>
            {missing ? (
              <span className="rounded-full bg-[#FDF3DE] px-2 py-0.5 text-[9px] font-semibold text-[#B47B12]">
                🟠 {t('badgeMissing')}
              </span>
            ) : isEdited ? (
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[9px] font-semibold text-primary-700">
                ✏️ {t('badgeEdited')}
              </span>
            ) : (
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[9px] font-semibold text-primary-700">
                🟣 {t('badgeAi')}
              </span>
            )}
            {flagged ? (
              <span className="rounded-full bg-[#FDF3DE] px-2 py-0.5 text-[9px] font-semibold text-[#B47B12]">
                ⚠️ {t('badgeVerify')}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            {sourceCount(field) > 0 ? (
              <button
                type="button"
                onClick={() => showSource(field)}
                className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-1 text-[9px] font-semibold text-primary-700 hover:bg-primary-100"
              >
                <Volume2 className="h-2.5 w-2.5" />
                {t('source', { count: sourceCount(field) })}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void regenerate(field)}
              disabled={Boolean(regenerating) || !transcript}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold text-ink-400 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-40"
            >
              {regenerating === field ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <RefreshCw className="h-2.5 w-2.5" />
              )}
              {t('regenerate')}
            </button>
          </div>
        </div>

        {multiline ? (
          <Textarea
            id={`field-${field}`}
            value={value}
            onChange={(event) => setField(field, event.target.value)}
            placeholder={missing ? t('completePlaceholder') : undefined}
            className="mt-2 min-h-[84px] bg-white text-[12px] leading-relaxed"
          />
        ) : field === 'followUpDate' ? (
          <Input
            id={`field-${field}`}
            type="date"
            value={value}
            onChange={(event) => setField(field, event.target.value)}
            className="mt-2 bg-white"
          />
        ) : (
          <Input
            id={`field-${field}`}
            value={value}
            onChange={(event) => setField(field, event.target.value)}
            placeholder={missing ? t('completePlaceholder') : undefined}
            className="mt-2 bg-white"
          />
        )}
      </div>
    );
  };

  const transcriptPanel = (
    <div className="rounded-[28px] bg-white p-4 shadow-card ring-1 ring-line/70 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary-500" />
          <p className="text-sm font-bold">{t('transcriptTitle')}</p>
        </div>
        <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[9px] font-semibold text-ink-500">
          {transcript ? `${transcript.segments.length} ${t('segments')}` : t('noTranscript')}
        </span>
      </div>

      {audioPresent ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-primary-50/70 p-3">
          <button
            type="button"
            onClick={togglePlay}
            className="grid h-10 w-10 place-items-center rounded-full bg-primary-600 text-white shadow-soft"
            aria-label={playing ? t('pause') : t('play')}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-primary-500 transition-all"
                style={{ width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-ink-400">
              <span>{formatCountdown(Math.floor(currentTime))}</span>
              <span>{formatCountdown(Math.floor(duration))}</span>
            </div>
          </div>
          <span className="rounded-full bg-white px-2 py-1 text-[9px] font-semibold text-success">
            {t('audioAvailable')}
          </span>
          <button
            type="button"
            onClick={() => void deleteAudio()}
            disabled={deletingAudio}
            className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[9px] font-semibold text-danger ring-1 ring-[#FDECEC] hover:bg-[#FDECEC] disabled:opacity-50"
            title={t('audioDeleteNow')}
          >
            {deletingAudio ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Trash2 className="h-2.5 w-2.5" />
            )}
            {t('audioDeleteNow')}
          </button>
          <audio
            ref={audioRef}
            src={`/api/doctor/consultations/${consultationId}/audio`}
            preload="metadata"
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-primary-50/60 px-3 py-2 text-[10px] text-ink-400">
          {t('audioDeleted')}
        </p>
      )}

      {transcript ? (
        <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pe-1">
          {transcript.segments.map((segment) => {
            const highlighted = highlightIds.includes(segment.id);
            const active = activeSegment === segment.id;
            return (
              <button
                key={segment.id}
                id={`segment-${segment.id}`}
                type="button"
                onClick={() => seek(segment)}
                className={cn(
                  'w-full rounded-2xl border p-3 text-start transition-colors',
                  active
                    ? 'border-primary-300 bg-primary-50'
                    : highlighted
                      ? 'border-[#F3D9A4] bg-[#FEFBF4]'
                      : 'border-transparent bg-primary-50/40 hover:bg-primary-50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider',
                      segment.speaker === 'DOCTOR'
                        ? 'bg-primary-100 text-primary-700'
                        : segment.speaker === 'PATIENT'
                          ? 'bg-accent-100 text-accent-600'
                          : 'bg-primary-50 text-ink-400',
                    )}
                  >
                    {segment.speaker === 'DOCTOR'
                      ? t('speakerDoctor')
                      : segment.speaker === 'PATIENT'
                        ? t('speakerPatient')
                        : t('speakerUnknown')}
                  </span>
                  <span className="ltr-code text-[9px] text-ink-400">
                    {formatCountdown(segment.start)}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-700">{segment.text}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-400">{t('noTranscript')}</p>
      )}
    </div>
  );

  const draftPanel = (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary-500" />
            <p className="text-xs font-bold">{t('aiNoticeTitle')}</p>
          </div>
          <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[9px] font-semibold text-primary-700">
            {draft.provider}
            {draft.model ? ` · ${draft.model}` : ''} · {draft.promptVersion}
          </span>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-ink-500">{t('aiNoticeBody')}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[9px] font-semibold text-primary-700">
            🟣 {t('legendAi')}
          </span>
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[9px] font-semibold text-primary-700">
            ✏️ {t('legendEdited')}
          </span>
          <span className="rounded-full bg-[#FDF3DE] px-2 py-0.5 text-[9px] font-semibold text-[#B47B12]">
            🟠 {t('legendMissing')}
          </span>
          <span className="rounded-full bg-[#FDF3DE] px-2 py-0.5 text-[9px] font-semibold text-[#B47B12]">
            ⚠️ {t('legendVerify')}
          </span>
        </div>
      </div>

      {draft.warnings.length > 0 ? (
        <div className="rounded-2xl border border-[#F3D9A4] bg-[#FEFBF4] p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-[#8A6A18]">
            <AlertTriangle className="h-4 w-4" />
            {t('warningsTitle')}
          </p>
          <ul className="mt-2 space-y-1.5">
            {draft.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`} className="text-[10px] leading-relaxed text-[#8A6A18]">
                • {warning.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {draft.uncertainPassages.length > 0 ? (
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-xs font-bold">{t('uncertainTitle')}</p>
          <ul className="mt-2 space-y-1.5">
            {draft.uncertainPassages.map((passage, index) => (
              <li key={index} className="rounded-xl bg-primary-50/50 px-3 py-2 text-[10px] leading-relaxed text-ink-500">
                « {passage.text} » — {passage.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2.5">{EXTRACTION_FIELDS.map((field) => fieldCard(field))}</div>

      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold">{t('prescriptionsTitle')}</p>
            {prescriptionsEdited ? (
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[9px] font-semibold text-primary-700">
                ✏️ {t('badgeEdited')}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="soft"
            size="sm"
            onClick={() => setPrescriptions((previous) => [...previous, { ...EMPTY_ROW }])}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('addPrescription')}
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-ink-400">{t('prescriptionHint')}</p>

        <div className="mt-3 space-y-3">
          {prescriptions.length === 0 ? (
            <p className="rounded-xl bg-primary-50/50 px-3 py-3 text-[11px] text-ink-400">
              {t('noPrescription')}
            </p>
          ) : null}
          {prescriptions.map((row, index) => {
            const needsConfirmation = Boolean(row.medication.trim()) && !row.confirmed;
            return (
              <div
                key={index}
                className={cn(
                  'rounded-2xl border p-3',
                  needsConfirmation ? 'border-[#F3D9A4] bg-[#FEFBF4]' : 'border-line bg-white',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary-600">
                    #{index + 1}
                    {row.evidence.length > 0 ? (
                      <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[8px]">🟣 {t('badgeAi')}</span>
                    ) : (
                      <span className="rounded-full bg-primary-50 px-1.5 py-0.5 text-[8px]">✏️ {t('badgeEdited')}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPrescriptions((previous) => previous.filter((_, rowIndex) => rowIndex !== index))
                    }
                    className="grid h-7 w-7 place-items-center rounded-full text-ink-400 hover:bg-[#FDECEC] hover:text-danger"
                    aria-label={t('removePrescription')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Input
                    value={row.medication}
                    onChange={(event) => updateRow(index, { medication: event.target.value })}
                    placeholder={t('medication')}
                    className="h-10 bg-white py-2 text-xs sm:col-span-2"
                  />
                  <Input
                    value={row.dosage}
                    onChange={(event) => updateRow(index, { dosage: event.target.value })}
                    placeholder={t('dosage')}
                    className="h-10 bg-white py-2 text-xs"
                  />
                  <Input
                    value={row.frequency}
                    onChange={(event) => updateRow(index, { frequency: event.target.value })}
                    placeholder={t('frequency')}
                    className="h-10 bg-white py-2 text-xs"
                  />
                  <Input
                    value={row.duration}
                    onChange={(event) => updateRow(index, { duration: event.target.value })}
                    placeholder={t('duration')}
                    className="h-10 bg-white py-2 text-xs"
                  />
                  <Input
                    value={row.notes}
                    onChange={(event) => updateRow(index, { notes: event.target.value })}
                    placeholder={t('notes')}
                    className="h-10 bg-white py-2 text-xs"
                  />
                </div>

                <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[10px] font-semibold text-ink-700 ring-1 ring-line">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[#6F63B5]"
                    checked={row.confirmed}
                    onChange={(event) => updateRow(index, { confirmed: event.target.checked })}
                  />
                  {t('confirmPrescription')}
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-4">
        <label className="flex cursor-pointer items-start gap-2.5 text-[11px] font-semibold leading-relaxed text-ink-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[#6F63B5]"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
          />
          {t('reviewedCheckbox')}
        </label>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-400">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          {t('doctorOnly')}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-ink-500 ring-1 ring-line">
          <Sparkles className="h-3.5 w-3.5 text-primary-500" />
          {t('headerBadge')}
        </div>
        <div className="flex items-center gap-2">
          {savedAt ? (
            <span className="hidden items-center gap-1.5 text-[10px] text-ink-400 sm:flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              {t('saved')}
            </span>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void saveDraft()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t('save')}
          </Button>
        </div>
      </div>

      <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-line lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab('draft')}
          className={cn(
            'flex-1 rounded-full px-3 py-2 text-[11px] font-semibold transition-colors',
            mobileTab === 'draft' ? 'bg-primary-600 text-white' : 'text-ink-500',
          )}
        >
          {t('tabDraft')}
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('transcript')}
          className={cn(
            'flex-1 rounded-full px-3 py-2 text-[11px] font-semibold transition-colors',
            mobileTab === 'transcript' ? 'bg-primary-600 text-white' : 'text-ink-500',
          )}
        >
          {t('tabTranscript')}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className={cn('lg:sticky lg:top-4 lg:self-start', mobileTab === 'transcript' ? 'block' : 'hidden lg:block')}>
          {transcriptPanel}
        </div>
        <div className={cn(mobileTab === 'draft' ? 'block' : 'hidden lg:block')}>{draftPanel}</div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 p-3 backdrop-blur lg:static lg:rounded-2xl lg:border lg:bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <div className="hidden min-w-0 items-center gap-2 text-[10px] text-ink-400 sm:flex">
            <PencilLine className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('footerHint')}</span>
          </div>
          <Button
            type="button"
            variant="violet"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => void validate()}
            disabled={validating}
          >
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            {t('validate')}
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
