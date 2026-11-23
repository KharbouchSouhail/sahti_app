import {
  EXTRACTION_FIELDS,
  emptyExtraction,
  type ExtractionData,
  type ExtractedField,
  type ExtractedPrescription,
  type TranscriptSegment,
} from '@/lib/ai/types';
import { normalizeText } from '@/lib/ai/extraction/verify';

type Sentence = { segment: TranscriptSegment; text: string };

function sentences(text: string) {
  return text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isNegated(text: string) {
  const normalized = ` ${normalizeText(text)} `;
  return [
    'pas de',
    'pas d ',
    'aucun',
    'aucune',
    'sans ',
    'لا يوجد',
    'لا توجد',
    'ليس',
    'ما كاين',
    'بدون',
  ].some((marker) => normalized.includes(normalizeText(marker)));
}

function doctorSentences(segments: TranscriptSegment[]): Sentence[] {
  return segments
    .filter((segment) => segment.speaker !== 'PATIENT')
    .flatMap((segment) => sentences(segment.text).map((text) => ({ segment, text })));
}

function patientSentences(segments: TranscriptSegment[]): Sentence[] {
  return segments
    .filter((segment) => segment.speaker === 'PATIENT')
    .flatMap((segment) => sentences(segment.text).map((text) => ({ segment, text })));
}

function uniqueIds(items: Sentence[]) {
  return [...new Set(items.map((item) => item.segment.id))];
}

function field(value: string, items: Sentence[]): ExtractedField {
  return { value: value.trim(), evidence: value.trim() ? uniqueIds(items) : [] };
}

function matchField(items: Sentence[], patterns: RegExp[]) {
  for (const item of items) {
    for (const pattern of patterns) {
      const match = item.text.match(pattern);
      if (match?.[1]?.trim()) {
        return { value: match[1].trim(), items: [item] };
      }
    }
  }
  return null;
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseFollowUp(items: Sentence[]) {
  const numberWords: Record<string, number> = {
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8,
    neuf: 9, dix: 10, 'أسبوع': 1, 'أسبوعين': 2, 'شهر': 1, 'شهرين': 2,
  };

  const fromFrench = (match: RegExpMatchArray, item: Sentence) => {
    const raw = match[1].toLowerCase();
    const count = /^\d+$/.test(raw) ? Number(raw) : numberWords[raw] ?? 0;
    const unit = match[2].toLowerCase();
    const days = unit.startsWith('jour') ? count : unit.startsWith('semaine') ? count * 7 : count * 30;
    return days > 0 ? { value: addDays(days), items: [item] } : null;
  };

  // 1) Dates explicites.
  for (const item of items) {
    const iso = item.text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (iso) return { value: iso[1], items: [item] };

    const numericDate = item.text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
    if (numericDate) {
      const [, day, month, year] = numericDate;
      return { value: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`, items: [item] };
    }
  }

  // 2) « dans X » (rendez-vous planifié) avant « après X » (conditionnel).
  for (const item of items) {
    const match = item.text.match(
      /\bdans\s+(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(jours?|semaines?|mois)/i,
    );
    if (match) {
      const result = fromFrench(match, item);
      if (result) return result;
    }
  }

  for (const item of items) {
    const match = item.text.match(
      /(?:apr[eè]s|prochain contr[oô]le dans)\s+(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(jours?|semaines?|mois)/i,
    );
    if (match) {
      const result = fromFrench(match, item);
      if (result) return result;
    }

    const arabic = item.text.match(/بعد\s+(\d+|أسبوعين|أسبوع|شهرين|شهر)\s*(أيام|يوم|أسابيع|أسبوع|أشهر|شهر)?/);
    if (arabic) {
      const raw = arabic[1];
      const count = /^\d+$/.test(raw) ? Number(raw) : numberWords[raw] ?? 1;
      const unit = arabic[2] ?? (raw.includes('أسبوع') ? 'أسبوع' : raw.includes('شهر') ? 'شهر' : 'أيام');
      const days = unit.includes('أسبوع') ? count * 7 : unit.includes('شهر') ? count * 30 : count;
      if (days > 0) return { value: addDays(days), items: [item] };
    }
  }
  return null;
}

function parsePrescriptions(items: Sentence[]): ExtractedPrescription[] {
  const result: ExtractedPrescription[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!/prescris|prescrire|prenez|prendre|prends|وصفة|خذ|تناول/i.test(item.text)) continue;

    const medication = item.text.match(
      /(?:prescris|prenez|prendre|prends|وصفة|خذ|تناول)\s+(?:aussi\s+)?(?:de\s+l[’']|de\s+la\s+|du\s+|des\s+|le\s+|la\s+|l[’']|بـ|ب)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9-]*(?:\s+\d+(?:[.,]\d+)?\s*(?:mg|g|µg|mcg|UI))?)/i,
    )?.[1];
    if (!medication) continue;

    const key = normalizeText(medication);
    if (seen.has(key)) continue;
    seen.add(key);

    const dosage =
      item.text.match(
        /((?:un|une|deux|trois|quatre|cinq|\d+)\s+(?:comprim[ée]s?|g[ée]lules?|bouff[ée]es?|injections?|gouttes?))/i,
      )?.[1] ??
      item.text.match(/(حبة|حبتين|كبسولة|كبسولتين|جرعة)/)?.[1] ??
      '';

    const frequency =
      item.text.match(
        /((?:une|deux|trois|quatre|cinq|\d+)\s+fois\s+(?:par|\/)\s+(?:jour|semaine|mois))/i,
      )?.[1] ??
      item.text.match(/((?:مرة|مرتين|ثلاث)\s*(?:في|بالـ?)\s*(?:اليوم|يوم))/)?.[1] ??
      '';

    const duration =
      item.text.match(
        /(?:pendant|durant|pour)\s+((?:un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+)\s+(?:jours?|semaines?|mois))/i,
      )?.[1] ??
      item.text.match(/لمدة\s+((?:\d+|أيام|أسابيع|أشهر)\s*(?:أيام|يوم|أسابيع|أشهر)?)/)?.[1] ??
      '';

    const notes = /si\s+fi[eè]vre/i.test(item.text)
      ? 'si fièvre'
      : /si\s+(?:besoin|douleur)/i.test(item.text)
        ? 'si besoin'
        : null;

    result.push({
      medication: medication.trim(),
      dosage: dosage.trim(),
      frequency: frequency.trim(),
      duration: duration.trim(),
      notes,
      evidence: [item.segment.id],
      confidence: 0.86,
      confirmed: false,
    });
  }

  return result;
}

function detectLanguage(segments: TranscriptSegment[]) {
  const text = segments.map((segment) => segment.text).join(' ');
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  return arabic / Math.max(1, text.length) > 0.2 ? 'ar' : 'fr';
}

/**
 * Extracteur déterministe utilisé quand LLM_PROVIDER=mock.
 * Il ne fait que reprendre des formulations explicites : aucune invention.
 */
export function mockExtraction(segments: TranscriptSegment[]): ExtractionData {
  const data = emptyExtraction();
  const doctors = doctorSentences(segments);
  const patients = patientSentences(segments);

  const reasonCandidate = patients.find((item) => !isNegated(item.text)) ?? patients[0];
  if (reasonCandidate) {
    data.reason = field(reasonCandidate.text, [reasonCandidate]);
  } else {
    const motif = matchField(doctors, [/motif\s*(?:est|:)\s*(.+)/i, /سبب الاستشارة\s*:?\s*(.+)/]);
    if (motif) data.reason = field(motif.value, motif.items);
  }

  const symptomSentences = patients.filter(
    (item) => !isNegated(item.text) && !/j'ai pris|تناولت|أخذت|خديت/i.test(item.text),
  );
  if (symptomSentences.length > 0) {
    data.symptoms = field(
      symptomSentences.map((item) => item.text).join(' '),
      symptomSentences,
    );
  }

  const examKeywords =
    /examen|temp[ée]rature|tension|auscultation|amygdales|saturation|fr[ée]quence cardiaque|\bTA\b|فحص|حرارة|ضغط|اللوزتين|البلعوم/i;
  const examSentences = doctors.filter(
    (item) => examKeywords.test(item.text) && !/diagnostic|التشخيص/i.test(item.text),
  );
  if (examSentences.length > 0) {
    data.examination = field(
      examSentences
        .map((item) => item.text.replace(/^(?:d'accord\.?\s*)?(?:à\s+)?l'examen\s*,?\s*/i, ''))
        .join(' '),
      examSentences,
    );
  }

  const diagnosis = matchField(doctors, [
    /(?:le\s+)?diagnostic\s*(?:est|retenu est|:)\s*(.+)/i,
    /il s'agit d(?:'une?|e la |u )\s*(.+)/i,
    /c'est (?:une|un)\s+(.+)/i,
    /التشخيص\s*(?:هو|:)?\s*(.+)/,
  ]);
  if (diagnosis) {
    data.diagnosis = field(
      diagnosis.value.replace(/^(?:une?|un)\s+/i, ''),
      diagnosis.items,
    );
  }

  const treatment = matchField(doctors, [
    /(?:le\s+)?traitement\s*(?:est|:)\s*(.+)/i,
    /العلاج\s*(?:هو|:)\s*(.+)/,
  ]);
  if (treatment) data.treatment = field(treatment.value, treatment.items);

  const recommendations = matchField(doctors, [
    /(?:en\s+)?recommandations?\s*[,:]\s*(.+)/i,
    /je (?:vous )?conseille\s+(.+)/i,
    /نوصي\s*(?:بـ|ب|:)?\s*(.+)/,
    /التوصيات\s*:?\s*(.+)/,
  ]);
  if (recommendations) {
    data.recommendations = field(recommendations.value, recommendations.items);
  }

  const followUp = parseFollowUp(doctors);
  if (followUp) data.followUpDate = field(followUp.value, followUp.items);

  data.prescriptions = parsePrescriptions(doctors);

  data.uncertainPassages = doctors
    .filter((item) => /probable|possible|suspect|peut-[êe]tre|[àa] confirmer|محتمل/i.test(item.text))
    .map((item) => ({
      text: item.text,
      reason: 'Formulation non certaine dans la transcription.',
      segmentIds: [item.segment.id],
    }));

  data.missingFields = EXTRACTION_FIELDS.filter((key) => !data[key].value.trim());

  return data;
}

export function detectTranscriptLanguage(segments: TranscriptSegment[]) {
  return detectLanguage(segments);
}
