export type Speaker = 'DOCTOR' | 'PATIENT' | 'UNKNOWN';

export type TranscriptSegment = {
  /** Identifiant stable utilisé comme preuve (ex. « s3 »). */
  id: string;
  /** Début en secondes. */
  start: number;
  /** Fin en secondes. */
  end: number;
  speaker: Speaker;
  text: string;
  confidence?: number;
};

export type TranscriptData = {
  language: string;
  text: string;
  segments: TranscriptSegment[];
  provider: string;
  model?: string | null;
};

export type ExtractedField = {
  /** Chaîne vide si l'information n'a pas été dite explicitement. */
  value: string;
  /** Identifiants de segments justifiant la valeur. */
  evidence: string[];
};

export type ExtractedPrescription = {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes?: string | null;
  evidence: string[];
  confidence?: number;
  /** Confirmation explicite du médecin avant validation. */
  confirmed?: boolean;
};

export type UncertainPassage = {
  text: string;
  reason: string;
  segmentIds: string[];
};

export type ExtractionData = {
  reason: ExtractedField;
  symptoms: ExtractedField;
  examination: ExtractedField;
  diagnosis: ExtractedField;
  treatment: ExtractedField;
  recommendations: ExtractedField;
  followUpDate: ExtractedField;
  prescriptions: ExtractedPrescription[];
  missingFields: string[];
  uncertainPassages: UncertainPassage[];
};

export type ExtractionWarning = {
  code: string;
  field: string;
  message: string;
  rejected?: { medication: string; evidence: string[] };
};

export type VerifiedExtraction = {
  data: ExtractionData;
  unverifiedFields: string[];
  warnings: ExtractionWarning[];
  fieldSources: Record<string, string[]>;
};

export type AiMeta = {
  provider: string;
  model?: string | null;
  promptVersion: string;
  generatedAt: string;
  editedFields: string[];
  regeneratedSections: string[];
  fieldSources: Record<string, string[]>;
  unverifiedFields: string[];
  warnings: ExtractionWarning[];
  language: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

export const EXTRACTION_FIELDS = [
  'reason',
  'symptoms',
  'examination',
  'diagnosis',
  'treatment',
  'recommendations',
  'followUpDate',
] as const;

export type ExtractionField = (typeof EXTRACTION_FIELDS)[number];

export const FIELD_LABELS: Record<ExtractionField, { fr: string; ar: string }> = {
  reason: { fr: 'Motif', ar: 'سبب الاستشارة' },
  symptoms: { fr: 'Symptômes', ar: 'الأعراض' },
  examination: { fr: 'Examen clinique', ar: 'الفحص السريري' },
  diagnosis: { fr: 'Diagnostic', ar: 'التشخيص' },
  treatment: { fr: 'Traitement', ar: 'العلاج' },
  recommendations: { fr: 'Recommandations', ar: 'التوصيات' },
  followUpDate: { fr: 'Prochain contrôle', ar: 'الموعد القادم' },
};

export function emptyExtraction(): ExtractionData {
  const field = (): ExtractedField => ({ value: '', evidence: [] });
  return {
    reason: field(),
    symptoms: field(),
    examination: field(),
    diagnosis: field(),
    treatment: field(),
    recommendations: field(),
    followUpDate: field(),
    prescriptions: [],
    missingFields: [...EXTRACTION_FIELDS],
    uncertainPassages: [],
  };
}

export function transcriptText(segments: TranscriptSegment[]): string {
  return segments
    .map((segment) => `[${segment.id}] ${segment.speaker}: ${segment.text}`)
    .join('\n');
}
