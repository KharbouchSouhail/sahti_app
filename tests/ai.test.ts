import { describe, expect, it } from 'vitest';
import { validateConsent, hasRecordingConsent } from '@/lib/ai/consent';
import { validateReview, computeEditedFields } from '@/lib/ai/review';
import { buildReviewData, reviewPayloadSchema } from '@/lib/ai/review-schema';
import { verifyExtraction } from '@/lib/ai/extraction/verify';
import { mockExtraction } from '@/lib/ai/extraction/mock';
import { MOCK_TRANSCRIPT_SEGMENTS } from '@/lib/ai/mock-transcript';
import { emptyExtraction, type ExtractionData, type TranscriptSegment } from '@/lib/ai/types';

describe('consentement', () => {
  it('exige audio + traitement IA', () => {
    expect(validateConsent({ audio: true, aiProcessing: false, retention: false, patientRefused: false }).ok).toBe(false);
    expect(validateConsent({ audio: false, aiProcessing: true, retention: false, patientRefused: false }).ok).toBe(false);
    const ok = validateConsent({ audio: true, aiProcessing: true, retention: false, patientRefused: false });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.types).toEqual(['AUDIO', 'AI_PROCESSING']);
  });

  it('la rétention est facultative', () => {
    const ok = validateConsent({ audio: true, aiProcessing: true, retention: true, patientRefused: false });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.types).toContain('RETENTION');
  });

  it('le refus du patient bascule en manuel sans enregistrement', () => {
    const result = validateConsent({ audio: false, aiProcessing: false, retention: false, patientRefused: true });
    expect(result).toEqual({ ok: true, manual: true, types: [] });
  });

  it('hasRecordingConsent vérifie les deux accords', () => {
    expect(hasRecordingConsent([{ type: 'AUDIO', granted: true }])).toBe(false);
    expect(
      hasRecordingConsent([
        { type: 'AUDIO', granted: true },
        { type: 'AI_PROCESSING', granted: true },
      ]),
    ).toBe(true);
  });
});

describe('validation de la relecture', () => {
  const base = {
    fields: {
      reason: 'Angine',
      symptoms: '',
      examination: '',
      diagnosis: 'Angine aiguë',
      treatment: 'Antibiothérapie',
      recommendations: '',
      followUpDate: '',
    },
    prescriptions: [],
    reviewed: true,
  };

  it('refuse sans case de relecture', () => {
    expect(validateReview({ ...base, reviewed: false })).toContain('REVIEW_REQUIRED');
  });

  it('refuse un brouillon incomplet', () => {
    expect(
      validateReview({ ...base, fields: { ...base.fields, diagnosis: '' } }),
    ).toContain('COMPLETE_REQUIRED');
  });

  it('accepte traitement OU recommandations', () => {
    expect(
      validateReview({
        ...base,
        fields: { ...base.fields, treatment: '', recommendations: 'Repos' },
      }),
    ).toEqual([]);
  });

  it('exige dosage/fréquence/durée et confirmation pour chaque médicament', () => {
    const errors = validateReview({
      ...base,
      prescriptions: [
        { medication: 'Amoxicilline', dosage: '1 g', frequency: '', duration: '6 j', confirmed: true, notes: null },
      ],
    });
    expect(errors).toContain('PRESCRIPTION_INCOMPLETE');

    const unconfirmed = validateReview({
      ...base,
      prescriptions: [
        { medication: 'Amoxicilline', dosage: '1 g', frequency: '2/j', duration: '6 j', confirmed: false, notes: null },
      ],
    });
    expect(unconfirmed).toContain('PRESCRIPTION_UNCONFIRMED');
  });

  it('ignore les lignes vides et valide une date ISO', () => {
    expect(
      validateReview({
        ...base,
        prescriptions: [{ medication: '', dosage: '', frequency: '', duration: '', confirmed: false, notes: null }],
        fields: { ...base.fields, followUpDate: '2026-12-01' },
      }),
    ).toEqual([]);
    expect(
      validateReview({ ...base, fields: { ...base.fields, followUpDate: 'pas-une-date' } }),
    ).toContain('INVALID_DATE');
  });
});

describe('schéma de relecture (zod)', () => {
  it('applique les valeurs par défaut', () => {
    const parsed = reviewPayloadSchema.parse({ fields: { reason: 'Test' } });
    expect(parsed.fields.diagnosis).toBe('');
    expect(parsed.prescriptions).toEqual([]);
    expect(parsed.reviewed).toBe(false);
  });

  it('buildReviewData retire la preuve des champs modifiés et recalcule les manquants', () => {
    const original = mockExtraction(MOCK_TRANSCRIPT_SEGMENTS);
    const body = reviewPayloadSchema.parse({
      fields: { reason: 'Motif corrigé par le médecin', diagnosis: original.diagnosis.value },
      prescriptions: [],
      reviewed: true,
    });
    const next = buildReviewData(original, body);
    expect(next.reason.value).toBe('Motif corrigé par le médecin');
    expect(next.reason.evidence).toEqual([]);
    expect(next.diagnosis.evidence.length).toBeGreaterThan(0);
    expect(next.missingFields).toContain('treatment');
    expect(next.prescriptions).toEqual([]);
  });

  it('computeEditedFields liste les champs modifiés', () => {
    const original = mockExtraction(MOCK_TRANSCRIPT_SEGMENTS);
    const payload = {
      fields: {
        reason: original.reason.value,
        symptoms: original.symptoms.value,
        examination: original.examination.value,
        diagnosis: 'Diagnostic corrigé',
        treatment: '',
        recommendations: original.recommendations.value,
        followUpDate: original.followUpDate.value,
      },
      prescriptions: [],
      reviewed: true,
    };
    const edited = computeEditedFields(original, payload);
    expect(edited).toContain('diagnosis');
    expect(edited).toContain('prescriptions');
    expect(edited).not.toContain('reason');
  });
});

describe('extracteur mock + garde-fous', () => {
  it('ne prescrit jamais un médicament cité par le patient', () => {
    const data = mockExtraction(MOCK_TRANSCRIPT_SEGMENTS);
    const medications = data.prescriptions.map((row) => row.medication.toLowerCase());
    expect(medications.some((name) => name.includes('amoxicilline'))).toBe(true);
    expect(medications.some((name) => name.includes('paracétamol'))).toBe(true);
    expect(medications.some((name) => name.includes('ibuprofène'))).toBe(false);
  });

  it('ne transforme pas « pas de toux » en symptôme', () => {
    const data = mockExtraction(MOCK_TRANSCRIPT_SEGMENTS);
    expect(data.symptoms.value.toLowerCase()).not.toContain('toux');
  });

  it('laisse vides les champs non dits explicitement', () => {
    const data = mockExtraction(MOCK_TRANSCRIPT_SEGMENTS);
    expect(data.treatment.value).toBe('');
    expect(data.missingFields).toContain('treatment');
  });

  const segments: TranscriptSegment[] = [
    { id: 's1', start: 0, end: 8, speaker: 'PATIENT', text: "Je pense que c'est une angine. J'ai pris de l'Ibuprofène." },
    { id: 's2', start: 8, end: 12, speaker: 'DOCTOR', text: 'Pas de fièvre.' },
  ];

  it('écarte un diagnostic appuyé uniquement sur le patient', () => {
    const data = emptyExtraction();
    data.diagnosis = { value: 'angine', evidence: ['s1'] };
    const verified = verifyExtraction(data, segments);
    expect(verified.data.diagnosis.value).toBe('');
    expect(verified.warnings.some((warning) => warning.code === 'FIELD_NOT_FROM_DOCTOR')).toBe(true);
  });

  it('écarte une négation et un médicament patient', () => {
    const data = emptyExtraction();
    data.symptoms = { value: 'fièvre', evidence: ['s2'] };
    data.prescriptions = [
      { medication: 'Ibuprofène', dosage: '1 cp', frequency: '2/j', duration: '3 j', evidence: ['s1'] },
    ];
    const verified = verifyExtraction(data, segments);
    expect(verified.data.symptoms.value).toBe('');
    expect(verified.data.prescriptions).toEqual([]);
    expect(verified.warnings.some((warning) => warning.code === 'NEGATION_DETECTED')).toBe(true);
    expect(verified.warnings.some((warning) => warning.code === 'PRESCRIPTION_PATIENT_MENTIONED')).toBe(true);
  });

  it('signale une valeur sans preuve exploitable', () => {
    const data = emptyExtraction();
    data.examination = { value: 'TA 120/80', evidence: ['s99'] };
    const verified = verifyExtraction(data, segments);
    expect(verified.unverifiedFields).toContain('examination');
    expect(verified.warnings.some((warning) => warning.code === 'MISSING_EVIDENCE')).toBe(true);
  });

  it('conserve une valeur médecin avec preuve', () => {
    const doctorSegments: TranscriptSegment[] = [
      { id: 's1', start: 0, end: 8, speaker: 'DOCTOR', text: 'Le diagnostic est une angine aiguë.' },
    ];
    const data: ExtractionData = emptyExtraction();
    data.diagnosis = { value: 'angine aiguë', evidence: ['s1'] };
    const verified = verifyExtraction(data, doctorSegments);
    expect(verified.data.diagnosis.value).toBe('angine aiguë');
    expect(verified.unverifiedFields).not.toContain('diagnosis');
  });
});
