import { z } from 'zod';
import { EXTRACTION_FIELDS, emptyExtraction, type ExtractionData } from '@/lib/ai/types';

const evidenceSchema = z.array(z.string().trim().max(64)).max(60).default([]);

const fieldObjectSchema = z.object({
  value: z.string().max(12_000).default(''),
  evidence: evidenceSchema,
});

/** Tolère `"diagnostic": "texte"` en plus de la forme objet attendue. */
const extractedFieldSchema = z
  .union([z.string().max(12_000), fieldObjectSchema])
  .transform((value) => (typeof value === 'string' ? { value, evidence: [] } : value));

export const extractedPrescriptionSchema = z.object({
  medication: z.string().trim().max(200).default(''),
  dosage: z.string().trim().max(160).default(''),
  frequency: z.string().trim().max(160).default(''),
  duration: z.string().trim().max(160).default(''),
  notes: z.string().trim().max(600).nullable().optional(),
  evidence: evidenceSchema,
  confidence: z.number().min(0).max(1).optional(),
});

export const extractionSchema = z.object({
  reason: extractedFieldSchema,
  symptoms: extractedFieldSchema,
  examination: extractedFieldSchema,
  diagnosis: extractedFieldSchema,
  treatment: extractedFieldSchema,
  recommendations: extractedFieldSchema,
  followUpDate: extractedFieldSchema,
  prescriptions: z.array(extractedPrescriptionSchema).max(30).default([]),
  missingFields: z
    .array(z.enum(EXTRACTION_FIELDS))
    .max(EXTRACTION_FIELDS.length)
    .default([]),
  uncertainPassages: z
    .array(
      z.object({
        text: z.string().trim().max(2000).default(''),
        reason: z.string().trim().max(600).default(''),
        segmentIds: evidenceSchema,
      }),
    )
    .max(40)
    .default([]),
});

export type ParsedExtraction = z.infer<typeof extractionSchema>;

/**
 * Valide la sortie du LLM. En cas de champs manquants on complète avec des
 * valeurs vides : le brouillon reste utilisable, jamais inventé.
 */
export function parseExtraction(input: unknown): ExtractionData {
  const base = emptyExtraction();
  const parsed = extractionSchema.safeParse(input);
  if (!parsed.success) {
    return base;
  }
  const data = parsed.data;
  const missing = new Set<string>(data.missingFields);
  for (const field of EXTRACTION_FIELDS) {
    if (!data[field].value.trim()) missing.add(field);
  }
  return {
    reason: data.reason,
    symptoms: data.symptoms,
    examination: data.examination,
    diagnosis: data.diagnosis,
    treatment: data.treatment,
    recommendations: data.recommendations,
    followUpDate: data.followUpDate,
    prescriptions: data.prescriptions.map((row) => ({
      medication: row.medication,
      dosage: row.dosage,
      frequency: row.frequency,
      duration: row.duration,
      notes: row.notes ?? null,
      evidence: row.evidence,
      confidence: row.confidence,
      confirmed: false,
    })),
    missingFields: [...missing],
    uncertainPassages: data.uncertainPassages,
  };
}
