import {
  EXTRACTION_FIELDS,
  type ExtractionData,
  type ExtractionField,
  type ExtractionWarning,
  type TranscriptSegment,
  type VerifiedExtraction,
} from '@/lib/ai/types';

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'a', 'au', 'aux',
  'en', 'dans', 'sur', 'pour', 'par', 'avec', 'sans', 'est', 'sont', 'ete', 'etre',
  'il', 'elle', 'ils', 'elles', 'je', 'tu', 'nous', 'vous', 'on', 'ce', 'cette',
  'ces', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'votre', 'notre', 'qui', 'que',
  'quoi', 'dont', 'plus', 'moins', 'tres', 'bien', 'tout', 'tous', 'toute', 'aussi',
  'comme', 'mais', 'donc', 'car', 'si', 'ne', 'pas', 'non', 'oui', 'depuis', 'apres',
  'avant', 'fois', 'jour', 'jours', 'semaine', 'semaines', 'mois', 'heure', 'heures',
  'mg', 'ml', 'g', 'ui', 'comprime', 'comprimes', 'gelule', 'gelules', 'bouffee',
  'في', 'من', 'على', 'مع', 'هو', 'هي', 'هذا', 'هذه', 'التي', 'الذي', 'و', 'أو',
  'أن', 'كان', 'كانت', 'كل', 'بعد', 'قبل', 'يوم', 'أيام', 'أسبوع', 'شهر', 'مرة',
  'مرات', 'صباح', 'مساء', 'مع', 'بدون', 'لا', 'ما',
]);

const NEGATION_MARKERS = [
  'pas de', 'pas d ', "pas d'", 'aucun', 'aucune', 'sans ', 'negatif', 'negative',
  "n'a pas", "n'as pas", 'لا يوجد', 'لا توجد', 'ليس', 'ما كاين', 'ما عندو',
  'ما عندها', 'بدون', 'نفي',
];

export function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

/** Mots suffisamment spécifiques pour servir de preuve d'apparition. */
function distinctiveTokens(value: string) {
  return tokens(value).filter((token) => token.length >= 4 || /[\u0600-\u06FF]/.test(token));
}

function sentences(text: string) {
  return text
    .split(/[.!?؟\n;]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isNegatedSentence(sentence: string) {
  const normalized = ` ${normalizeText(sentence)} `;
  return NEGATION_MARKERS.some((marker) => normalized.includes(normalizeText(marker)));
}

function mentionsInNegatedClause(text: string, value: string) {
  const needles = distinctiveTokens(value);
  if (needles.length === 0) return false;
  const relevant = sentences(text).filter((sentence) => {
    const normalized = normalizeText(sentence);
    return needles.some((token) => normalized.includes(token));
  });
  if (relevant.length === 0) return false;
  return relevant.every((sentence) => isNegatedSentence(sentence));
}

function appearsIn(text: string, value: string) {
  const needles = distinctiveTokens(value);
  if (needles.length === 0) return true;
  const haystack = normalizeText(text);
  return needles.some((token) => haystack.includes(token));
}

export function verifyExtraction(
  data: ExtractionData,
  segments: TranscriptSegment[],
): VerifiedExtraction {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const unverified = new Set<string>();
  const warnings: ExtractionWarning[] = [];
  const fieldSources: Record<string, string[]> = {};

  const clean: ExtractionData = {
    ...data,
    prescriptions: [],
    missingFields: [],
    uncertainPassages: data.uncertainPassages ?? [],
  };

  for (const field of EXTRACTION_FIELDS) {
    const raw = data[field] ?? { value: '', evidence: [] };
    let value = raw.value.trim();
    const evidence = raw.evidence.filter((id) => byId.has(id));
    const evidenceSegments = evidence.map((id) => byId.get(id)!).filter(Boolean);

    if (!value) {
      clean[field] = { value: '', evidence: [] };
      continue;
    }

    // Une valeur sans preuve exploitable n'est jamais acceptée silencieusement.
    if (evidenceSegments.length === 0) {
      unverified.add(field);
      warnings.push({
        code: 'MISSING_EVIDENCE',
        field,
        message: `« ${field} » n'est justifié par aucun segment de la transcription.`,
      });
      clean[field] = { value, evidence: [] };
      continue;
    }

    // Le diagnostic et le plan ne peuvent venir que du médecin.
    const doctorFields: ExtractionField[] = ['diagnosis', 'treatment', 'recommendations'];
    if (doctorFields.includes(field) && evidenceSegments.every((s) => s.speaker === 'PATIENT')) {
      warnings.push({
        code: 'FIELD_NOT_FROM_DOCTOR',
        field,
        message: `« ${field} » n'a été dit que par le patient : valeur écartée.`,
      });
      clean[field] = { value: '', evidence: [] };
      continue;
    }

    // Négation : « pas de fièvre » ne doit pas devenir un symptôme.
    const negated = evidenceSegments.every((segment) => mentionsInNegatedClause(segment.text, value));
    if (negated) {
      warnings.push({
        code: 'NEGATION_DETECTED',
        field,
        message: `« ${field} » provient d'une formulation négative : valeur écartée.`,
      });
      clean[field] = { value: '', evidence: [] };
      continue;
    }

    // Paraphrase possible : on signale sans supprimer.
    if (!evidenceSegments.some((segment) => appearsIn(segment.text, value))) {
      unverified.add(field);
    }

    clean[field] = { value, evidence };
    fieldSources[field] = evidence;
  }

  for (const prescription of data.prescriptions ?? []) {
    const medication = prescription.medication.trim();
    if (!medication) continue;

    const evidence = prescription.evidence.filter((id) => byId.has(id));
    const evidenceSegments = evidence.map((id) => byId.get(id)!).filter(Boolean);

    if (evidenceSegments.length === 0) {
      warnings.push({
        code: 'PRESCRIPTION_UNVERIFIED',
        field: 'prescriptions',
        message: `« ${medication} » n'est justifié par aucun segment : ligne écartée.`,
        rejected: { medication, evidence: prescription.evidence },
      });
      continue;
    }

    if (evidenceSegments.every((segment) => segment.speaker === 'PATIENT')) {
      warnings.push({
        code: 'PRESCRIPTION_PATIENT_MENTIONED',
        field: 'prescriptions',
        message: `« ${medication} » a été cité par le patient mais pas prescrit par le médecin : ligne écartée.`,
        rejected: { medication, evidence },
      });
      continue;
    }

    if (!evidenceSegments.some((segment) => appearsIn(segment.text, medication))) {
      warnings.push({
        code: 'PRESCRIPTION_UNVERIFIED',
        field: 'prescriptions',
        message: `« ${medication} » n'apparaît pas dans les segments cités : ligne écartée.`,
        rejected: { medication, evidence },
      });
      continue;
    }

    clean.prescriptions.push({
      medication,
      dosage: prescription.dosage.trim(),
      frequency: prescription.frequency.trim(),
      duration: prescription.duration.trim(),
      notes: prescription.notes?.trim() || null,
      evidence,
      confidence: prescription.confidence,
      confirmed: false,
    });
    fieldSources.prescriptions = [
      ...new Set([...(fieldSources.prescriptions ?? []), ...evidence]),
    ];
  }

  clean.missingFields = EXTRACTION_FIELDS.filter((field) => !clean[field].value.trim());

  return {
    data: clean,
    unverifiedFields: [...unverified],
    warnings,
    fieldSources,
  };
}
