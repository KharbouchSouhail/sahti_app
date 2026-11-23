import { EXTRACTION_FIELDS, type ExtractionData, type ExtractionField } from '@/lib/ai/types';

export type ReviewPrescription = {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes?: string | null;
  confirmed: boolean;
};

export type ReviewPayload = {
  fields: Record<ExtractionField, string>;
  prescriptions: ReviewPrescription[];
  reviewed: boolean;
};

export type ReviewError =
  | 'REVIEW_REQUIRED'
  | 'COMPLETE_REQUIRED'
  | 'PRESCRIPTION_INCOMPLETE'
  | 'PRESCRIPTION_UNCONFIRMED'
  | 'INVALID_DATE';

/** Règles serveur : le médecin ne peut pas valider un brouillon incomplet. */
export function validateReview(payload: ReviewPayload): ReviewError[] {
  const errors: ReviewError[] = [];

  if (!payload.reviewed) errors.push('REVIEW_REQUIRED');

  const reason = payload.fields.reason?.trim() ?? '';
  const diagnosis = payload.fields.diagnosis?.trim() ?? '';
  const treatment = payload.fields.treatment?.trim() ?? '';
  const recommendations = payload.fields.recommendations?.trim() ?? '';
  if (!reason || !diagnosis || (!treatment && !recommendations)) {
    errors.push('COMPLETE_REQUIRED');
  }

  const followUp = payload.fields.followUpDate?.trim() ?? '';
  if (followUp && Number.isNaN(new Date(followUp).getTime())) {
    errors.push('INVALID_DATE');
  }

  for (const row of payload.prescriptions) {
    const medication = row.medication.trim();
    if (!medication) continue;
    if (!row.dosage.trim() || !row.frequency.trim() || !row.duration.trim()) {
      errors.push('PRESCRIPTION_INCOMPLETE');
    }
    if (!row.confirmed) {
      errors.push('PRESCRIPTION_UNCONFIRMED');
    }
  }

  return [...new Set(errors)];
}

/** Champs modifiés par le médecin par rapport au brouillon IA. */
export function computeEditedFields(
  original: ExtractionData,
  payload: ReviewPayload,
): string[] {
  const edited: string[] = [];
  for (const field of EXTRACTION_FIELDS) {
    if ((original[field]?.value ?? '') !== (payload.fields[field] ?? '')) {
      edited.push(field);
    }
  }

  const originalPrescriptions = JSON.stringify(
    original.prescriptions.map((row) => ({
      medication: row.medication,
      dosage: row.dosage,
      frequency: row.frequency,
      duration: row.duration,
      notes: row.notes ?? null,
    })),
  );
  const nextPrescriptions = JSON.stringify(
    payload.prescriptions
      .filter((row) => row.medication.trim())
      .map((row) => ({
        medication: row.medication.trim(),
        dosage: row.dosage.trim(),
        frequency: row.frequency.trim(),
        duration: row.duration.trim(),
        notes: row.notes?.trim() || null,
      })),
  );
  if (originalPrescriptions !== nextPrescriptions) {
    edited.push('prescriptions');
  }

  return edited;
}
