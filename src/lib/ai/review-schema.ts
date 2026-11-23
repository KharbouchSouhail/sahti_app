import { z } from 'zod';
import { EXTRACTION_FIELDS, type ExtractionData, type ExtractionField } from '@/lib/ai/types';
import type { ReviewPayload } from '@/lib/ai/review';

const text = (max: number) => z.string().max(max).default('');

export const reviewFieldsSchema = z.object({
  reason: text(2000),
  symptoms: text(12_000),
  examination: text(12_000),
  diagnosis: text(12_000),
  treatment: text(12_000),
  recommendations: text(12_000),
  followUpDate: text(64),
});

export const reviewPrescriptionSchema = z.object({
  medication: z.string().trim().max(200).default(''),
  dosage: z.string().trim().max(160).default(''),
  frequency: z.string().trim().max(160).default(''),
  duration: z.string().trim().max(160).default(''),
  notes: z.string().trim().max(600).nullable().optional(),
  confirmed: z.boolean().default(false),
});

export const reviewPayloadSchema = z.object({
  fields: reviewFieldsSchema,
  prescriptions: z.array(reviewPrescriptionSchema).max(30).default([]),
  reviewed: z.boolean().default(false),
});

export type ReviewBody = z.infer<typeof reviewPayloadSchema>;

export function toReviewPayload(body: ReviewBody): ReviewPayload {
  return {
    fields: body.fields as Record<ExtractionField, string>,
    prescriptions: body.prescriptions.map((row) => ({
      ...row,
      notes: row.notes ?? null,
    })),
    reviewed: body.reviewed,
  };
}

export function buildReviewData(original: ExtractionData, body: ReviewBody) {
  const next: ExtractionData = {
    ...original,
    prescriptions: [],
    uncertainPassages: original.uncertainPassages ?? [],
  };

  for (const field of EXTRACTION_FIELDS) {
    const value = body.fields[field].trim();
    const previous = original[field] ?? { value: '', evidence: [] };
    next[field] = {
      value,
      evidence: value && value === previous.value ? previous.evidence : [],
    };
  }

  next.prescriptions = body.prescriptions
    .filter((row) => row.medication.trim())
    .map((row) => {
      const match = original.prescriptions.find(
        (item) => item.medication.trim().toLowerCase() === row.medication.trim().toLowerCase(),
      );
      return {
        medication: row.medication.trim(),
        dosage: row.dosage.trim(),
        frequency: row.frequency.trim(),
        duration: row.duration.trim(),
        notes: row.notes?.trim() || null,
        evidence: match?.evidence ?? [],
        confidence: match?.confidence,
        confirmed: row.confirmed,
      };
    });

  next.missingFields = EXTRACTION_FIELDS.filter((field) => !next[field].value.trim());

  return next;
}

export function fieldSourcesFrom(data: ExtractionData) {
  const sources: Record<string, string[]> = {};
  for (const field of EXTRACTION_FIELDS) {
    if (data[field].evidence.length > 0) sources[field] = data[field].evidence;
  }
  const prescriptionEvidence = [...new Set(data.prescriptions.flatMap((row) => row.evidence))];
  if (prescriptionEvidence.length > 0) sources.prescriptions = prescriptionEvidence;
  return sources;
}
