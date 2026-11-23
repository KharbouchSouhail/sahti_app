/**
 * Évaluation hors ligne du pipeline IA (fournisseurs mock).
 * usage : npm run eval
 *
 * Vérifie :
 *  - 0 champ inventé (valeur sans preuve exploitable) ;
 *  - pièges de négation (une négation ne devient jamais un symptôme) ;
 *  - médicaments cités par le patient jamais prescrits ;
 *  - détection de langue et alternances fr / ar / darija ;
 *  - temps de traitement par consultation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { mockExtraction, detectTranscriptLanguage } from '../src/lib/ai/extraction/mock';
import { verifyExtraction, normalizeText } from '../src/lib/ai/extraction/verify';
import { EXTRACTION_FIELDS, type ExtractionData, type TranscriptSegment } from '../src/lib/ai/types';

type Expect = {
  contains?: Record<string, string>;
  empty?: string[];
  prescriptions?: string[];
  notPrescribed?: string[];
  symptomsNotContain?: string[];
  followUpDays?: number;
  followUpIso?: string;
  uncertain?: boolean;
};

type EvalCase = {
  id: string;
  name: string;
  language: string;
  segments: TranscriptSegment[];
  expect: Expect;
};

const cases = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'),
) as EvalCase[];

function includesNormalized(haystack: string, needle: string) {
  return normalizeText(haystack).includes(normalizeText(needle));
}

function isoPlusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(isoA: string, isoB: string) {
  return Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / 86_400_000;
}

let failures = 0;
let inventedTotal = 0;
let negationTraps = 0;
let negationPassed = 0;
let languageChecks = 0;
let languagePassed = 0;
let totalMs = 0;

console.log('Évaluation Sehhati — pipeline IA (mock)\n');

for (const testCase of cases) {
  const problems: string[] = [];
  const started = performance.now();
  const extracted = mockExtraction(testCase.segments);
  const verified = verifyExtraction(extracted, testCase.segments);
  const elapsed = performance.now() - started;
  totalMs += elapsed;
  const data = verified.data;
  const expect = testCase.expect;

  // 1) Champs inventés : valeur non vide sans preuve.
  for (const field of EXTRACTION_FIELDS) {
    if (data[field].value.trim() && data[field].evidence.length === 0) {
      inventedTotal += 1;
      problems.push(`INVENTÉ: ${field} sans preuve`);
    }
  }

  // 2) Contenu attendu.
  for (const [field, needle] of Object.entries(expect.contains ?? {})) {
    const value = data[field as keyof ExtractionData] as { value: string } | undefined;
    if (!value || !includesNormalized(value.value, needle)) {
      problems.push(`attendu « ${needle} » dans ${field}, obtenu « ${value?.value ?? ''} »`);
    }
  }

  for (const field of expect.empty ?? []) {
    const value = data[field as keyof ExtractionData] as { value: string } | undefined;
    if (value?.value.trim()) {
      problems.push(`${field} devait être vide, obtenu « ${value.value} »`);
    }
  }

  // 3) Prescriptions.
  const medications = data.prescriptions.map((row) => row.medication);
  for (const needle of expect.prescriptions ?? []) {
    if (!medications.some((medication) => includesNormalized(medication, needle))) {
      problems.push(`prescription attendue absente : ${needle}`);
    }
  }
  for (const needle of expect.notPrescribed ?? []) {
    if (medications.some((medication) => includesNormalized(medication, needle))) {
      problems.push(`médicament interdit prescrit : ${needle}`);
    }
  }

  // 4) Pièges de négation.
  const traps = expect.symptomsNotContain ?? [];
  if (traps.length > 0) {
    negationTraps += 1;
    let ok = true;
    for (const needle of traps) {
      if (includesNormalized(data.symptoms.value, needle)) {
        problems.push(`négation transformée en symptôme : ${needle}`);
        ok = false;
      }
    }
    if (ok) negationPassed += 1;
  }

  // 5) Suivi.
  if (expect.followUpIso && data.followUpDate.value !== expect.followUpIso) {
    problems.push(`suivi attendu ${expect.followUpIso}, obtenu ${data.followUpDate.value || '(vide)'}`);
  }
  if (expect.followUpDays !== undefined) {
    const target = isoPlusDays(expect.followUpDays);
    if (!data.followUpDate.value || daysBetween(data.followUpDate.value, target) > 1.5) {
      problems.push(`suivi attendu ~${target}, obtenu ${data.followUpDate.value || '(vide)'}`);
    }
  }

  // 6) Incertitude.
  if (expect.uncertain !== undefined) {
    const hasUncertain = data.uncertainPassages.length > 0;
    if (hasUncertain !== expect.uncertain) {
      problems.push(`incertitude attendue=${expect.uncertain}, obtenue=${hasUncertain}`);
    }
  }

  // 7) Langue.
  languageChecks += 1;
  const detected = detectTranscriptLanguage(testCase.segments);
  if (detected === testCase.language) languagePassed += 1;
  else problems.push(`langue attendue ${testCase.language}, détectée ${detected}`);

  failures += problems.length;
  const status = problems.length === 0 ? 'OK ' : 'ÉCHEC';
  console.log(
    `[${status}] ${testCase.id.padEnd(20)} ${elapsed.toFixed(1).padStart(7)} ms  ${testCase.name}`,
  );
  for (const problem of problems) console.log(`        - ${problem}`);
}

// Garde-fous : sortie LLM volontairement corrompue, verifyExtraction doit neutraliser.
console.log('\nGarde-fous post-LLM (sortie corrompue injectée) :');
const guardSegments: TranscriptSegment[] = [
  { id: 's1', start: 0, end: 8, speaker: 'PATIENT', text: "Je pense que c'est une angine. J'ai pris de l'Ibuprofène." },
  { id: 's2', start: 8, end: 12, speaker: 'DOCTOR', text: 'Pas de fièvre.' },
];
const corrupted: ExtractionData = {
  reason: { value: 'Contrôle', evidence: ['s1'] },
  symptoms: { value: 'fièvre', evidence: ['s2'] },
  examination: { value: 'TA 120/80', evidence: ['s99'] },
  diagnosis: { value: 'angine', evidence: ['s1'] },
  treatment: { value: '', evidence: [] },
  recommendations: { value: '', evidence: [] },
  followUpDate: { value: '', evidence: [] },
  prescriptions: [
    { medication: 'Ibuprofène', dosage: '1 comprimé', frequency: '2 fois par jour', duration: '3 jours', evidence: ['s1'], confirmed: false },
  ],
  missingFields: [],
  uncertainPassages: [],
};
const guarded = verifyExtraction(corrupted, guardSegments);
const guardChecks: Array<[string, boolean]> = [
  ['diagnostic patient-only écarté', guarded.data.diagnosis.value === ''],
  ['négation « pas de fièvre » écartée', guarded.data.symptoms.value === ''],
  ['médicament patient non prescrit', guarded.data.prescriptions.length === 0],
  ['preuve inexistante signalée', guarded.unverifiedFields.includes('examination')],
  ['avertissement négation présent', guarded.warnings.some((warning) => warning.code === 'NEGATION_DETECTED')],
  ['avertissement prescription patient présent', guarded.warnings.some((warning) => warning.code === 'PRESCRIPTION_PATIENT_MENTIONED')],
];
for (const [label, ok] of guardChecks) {
  console.log(`[${ok ? 'OK ' : 'ÉCHEC'}] ${label}`);
  if (!ok) failures += 1;
}

console.log('\n────────────────────────────────────────');
console.log(`Cas évalués            : ${cases.length}`);
console.log(`Champs inventés        : ${inventedTotal} (doit être 0)`);
console.log(`Pièges de négation     : ${negationPassed}/${negationTraps} réussis`);
console.log(`Détection de langue    : ${languagePassed}/${languageChecks} réussies`);
console.log(`Temps total extraction : ${totalMs.toFixed(1)} ms (moyenne ${(totalMs / cases.length).toFixed(1)} ms/cas)`);
console.log(`Échecs                 : ${failures}`);

if (inventedTotal > 0 || failures > 0) {
  console.error('\nÉvaluation EN ÉCHEC.');
  process.exit(1);
}
console.log('\nÉvaluation RÉUSSIE : aucune invention, négations respectées.');
