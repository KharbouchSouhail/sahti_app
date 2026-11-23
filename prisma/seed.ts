import { PrismaClient, Role, ConsultationStatus, LinkMethod, Locale, AccessScope, ConsentType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { MOCK_TRANSCRIPT_SEGMENTS } from '../src/lib/ai/mock-transcript';
import { mockExtraction } from '../src/lib/ai/extraction/mock';
import { verifyExtraction } from '../src/lib/ai/extraction/verify';
import type { AiMeta, TranscriptSegment } from '../src/lib/ai/types';

const prisma = new PrismaClient();
const PASSWORD = 'Demo1234!';

function daysAgo(n: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}
function daysAhead(n: number, hour = 9) {
  return daysAgo(-n, hour);
}

function escapePdf(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Builds a tiny but valid single-page PDF (Latin-1). */
function minimalPdf(lines: string[]): Buffer {
  const content = [
    'BT',
    '/F1 15 Tf',
    '60 780 Td',
    '20 TL',
    ...lines.map((l) => `(${escapePdf(l)}) Tj T*`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** WAV silence (8-bit mono) — audio de démonstration lisible par le navigateur. */
function silenceWav(seconds: number, sampleRate = 8000): Buffer {
  const dataSize = Math.max(1, Math.floor(seconds * sampleRate));
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  buffer.fill(128, 44);
  return buffer;
}

/** Transcript de démonstration en darija / français (pièges négation + médicament patient). */
const DARIJA_TRANSCRIPT_SEGMENTS: TranscriptSegment[] = [
  { id: 's1', start: 0, end: 8, speaker: 'PATIENT', text: 'سلام دكتور، عندي السخانة و حلقي كايضرني من جوج أيام.', confidence: 0.9 },
  { id: 's2', start: 8, end: 13, speaker: 'DOCTOR', text: 'واش عندك الكحبة؟', confidence: 0.92 },
  { id: 's3', start: 13, end: 22, speaker: 'PATIENT', text: 'لا، ما كايناش الكحبة. خديت Doliprane البارح و ما نفعش.', confidence: 0.88 },
  { id: 's4', start: 22, end: 34, speaker: 'DOCTOR', text: 'ف الفحص: الحرارة 38,5 و اللوزتين حمرين وفيهم قيح.', confidence: 0.91 },
  { id: 's5', start: 34, end: 42, speaker: 'DOCTOR', text: 'التشخيص هو التهاب اللوزتين الجرثومي.', confidence: 0.93 },
  { id: 's6', start: 42, end: 55, speaker: 'DOCTOR', text: 'خذ Amoxicilline 1 g، حبة مرتين في اليوم لمدة 6 أيام.', confidence: 0.9 },
  { id: 's7', start: 55, end: 68, speaker: 'DOCTOR', text: 'و خذ Paracétamol 1 g، حبة مرتين في اليوم إلا كانت السخانة، لمدة 5 أيام.', confidence: 0.87 },
  { id: 's8', start: 68, end: 80, speaker: 'DOCTOR', text: 'التوصيات: شرب الماء مزيان، الراحة، و إلا بقات السخانة أكثر من 3 أيام خاصك ترجع.', confidence: 0.9 },
  { id: 's9', start: 80, end: 88, speaker: 'DOCTOR', text: 'ارجع عندي بعد 7 أيام إلا ما تحسنتيش.', confidence: 0.86 },
  { id: 's10', start: 88, end: 92, speaker: 'UNKNOWN', text: '(صوت غير مفهوم — ضجيج خارجي)', confidence: 0.4 },
];

async function seedAiReviewConsultation(input: {
  doctorId: string;
  doctorUserId: string;
  segments: TranscriptSegment[];
  language: string;
  retention: boolean;
  consultedAt: Date;
}) {
  const verified = verifyExtraction(mockExtraction(input.segments), input.segments);
  const durationSec = Math.max(...input.segments.map((segment) => segment.end));

  const consultation = await prisma.consultation.create({
    data: {
      doctorId: input.doctorId,
      status: ConsultationStatus.AI_REVIEW,
      creationMode: 'AI',
      consultedAt: input.consultedAt,
      reason: '',
    },
  });

  const consentTypes: ConsentType[] = ['AUDIO', 'AI_PROCESSING'];
  if (input.retention) consentTypes.push('RETENTION');
  await prisma.recordingConsent.createMany({
    data: consentTypes.map((type) => ({
      consultationId: consultation.id,
      type,
      granted: true,
      method: 'DOCTOR_ATTESTATION',
    })),
  });

  const recording = await prisma.recording.create({
    data: {
      consultationId: consultation.id,
      status: 'READY',
      mimeType: 'audio/wav',
      durationSec,
      chunkCount: Math.ceil(durationSec / 10),
      startedAt: input.consultedAt,
      finishedAt: new Date(input.consultedAt.getTime() + durationSec * 1000),
      expiresAt: input.retention
        ? new Date(Date.now() + 7 * 24 * 3600 * 1000)
        : null,
    },
  });

  const wav = silenceWav(durationSec);
  const dir = path.join(process.cwd(), 'uploads', 'recordings', recording.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'audio.wav'), wav);
  await prisma.recording.update({
    where: { id: recording.id },
    data: { storagePath: `${recording.id}/audio.wav`, sizeBytes: wav.length },
  });

  const transcript = await prisma.transcript.create({
    data: {
      consultationId: consultation.id,
      recordingId: recording.id,
      language: input.language,
      text: input.segments.map((segment) => segment.text).join(' '),
      segments: input.segments as unknown as object[],
      provider: 'mock',
      model: 'mock-stt-v1',
    },
  });

  await prisma.aiExtraction.create({
    data: {
      consultationId: consultation.id,
      transcriptId: transcript.id,
      version: 1,
      provider: 'mock',
      model: 'mock-rule-based-v1',
      promptVersion: 'v1',
      data: verified.data as unknown as object,
      missingFields: verified.data.missingFields,
      unverifiedFields: verified.unverifiedFields,
      warnings: verified.warnings as unknown as object[],
      status: 'DRAFT',
    },
  });

  const aiMeta: AiMeta = {
    provider: 'mock',
    model: 'mock-rule-based-v1',
    promptVersion: 'v1',
    generatedAt: new Date().toISOString(),
    editedFields: [],
    regeneratedSections: [],
    fieldSources: verified.fieldSources,
    unverifiedFields: verified.unverifiedFields,
    warnings: verified.warnings,
    language: input.language,
  };
  await prisma.consultation.update({
    where: { id: consultation.id },
    data: { aiMeta: aiMeta as unknown as object },
  });

  await prisma.processingJob.createMany({
    data: [
      {
        consultationId: consultation.id,
        type: 'TRANSCRIBE',
        status: 'SUCCEEDED',
        attempts: 1,
        createdAt: input.consultedAt,
      },
      {
        consultationId: consultation.id,
        type: 'EXTRACT',
        status: 'SUCCEEDED',
        attempts: 1,
        createdAt: input.consultedAt,
      },
    ],
  });

  await prisma.notification.create({
    data: {
      userId: input.doctorUserId,
      title: 'Brouillon IA prêt à relire',
      body: 'Une consultation enregistrée a été transcrite. Vérifiez chaque information avant validation.',
      href: `/fr/doctor/consultations/${consultation.id}/review`,
      createdAt: input.consultedAt,
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        userId: input.doctorUserId,
        action: 'CONSENT_GIVEN',
        entityType: 'Consultation',
        entityId: consultation.id,
        createdAt: input.consultedAt,
      },
      {
        userId: input.doctorUserId,
        action: 'RECORDING_FINALIZED',
        entityType: 'Consultation',
        entityId: consultation.id,
        createdAt: input.consultedAt,
      },
      {
        userId: input.doctorUserId,
        action: 'AI_DRAFT_READY',
        entityType: 'Consultation',
        entityId: consultation.id,
        createdAt: input.consultedAt,
      },
    ],
  });

  return consultation;
}

async function main() {
  console.log('Seed Sehhati…');

  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.recorderSession.deleteMany();
  await prisma.processingJob.deleteMany();
  await prisma.aiExtraction.deleteMany();
  await prisma.transcript.deleteMany();
  await prisma.recording.deleteMany();
  await prisma.recordingConsent.deleteMany();
  await prisma.accessGrant.deleteMany();
  await prisma.claimCode.deleteMany();
  await prisma.patientLinkToken.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.consultation.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = bcrypt.hashSync(PASSWORD, 12);

  const drAlami = await prisma.doctor.create({
    data: {
      specialty: 'Médecine générale',
      licenseNumber: 'MA-10452',
      clinicName: 'Cabinet Al Amal',
      city: 'Casablanca',
      user: {
        create: {
          email: 'dr.alami@demo.ma',
          passwordHash,
          role: Role.DOCTOR,
          fullName: 'Dr. Youssef Alami',
          phone: '+212 6 61 22 33 44',
          locale: Locale.fr,
        },
      },
    },
  });

  const drBenani = await prisma.doctor.create({
    data: {
      specialty: 'Cardiologie',
      licenseNumber: 'MA-20931',
      clinicName: 'Clinique Atlas',
      city: 'Rabat',
      user: {
        create: {
          email: 'dr.benani@demo.ma',
          passwordHash,
          role: Role.DOCTOR,
          fullName: 'Dr. Salma Benani',
          phone: '+212 6 70 11 55 22',
          locale: Locale.fr,
        },
      },
    },
  });

  const ahmed = await prisma.patient.create({
    data: {
      patientCode: 'SH-482913',
      birthDate: new Date('1981-04-12'),
      gender: 'M',
      bloodType: 'O+',
      allergies: ['Pénicilline', 'Arachides'],
      chronicDiseases: ['Hypertension', 'Diabète type 2'],
      user: {
        create: {
          email: 'ahmed@demo.ma',
          passwordHash,
          role: Role.PATIENT,
          fullName: 'Ahmed Berrada',
          phone: '+212 6 12 90 45 78',
          locale: Locale.fr,
        },
      },
    },
  });

  const salma = await prisma.patient.create({
    data: {
      patientCode: 'SH-731042',
      birthDate: new Date('1992-09-23'),
      gender: 'F',
      bloodType: 'A-',
      allergies: ['Iode'],
      chronicDiseases: ['Asthme'],
      user: {
        create: {
          email: 'salma@demo.ma',
          passwordHash,
          role: Role.PATIENT,
          fullName: 'Salma Idrissi',
          phone: '+212 6 55 21 88 03',
          locale: Locale.ar,
        },
      },
    },
  });

  const uploadDir = path.join(process.cwd(), 'uploads', 'seed');
  fs.mkdirSync(uploadDir, { recursive: true });

  const labPdf = minimalPdf([
    'Sehhati - Resultats de laboratoire (demo)',
    'Patient : Ahmed Berrada',
    'Date : 12/05/2026',
    '',
    'Glycemie a jeun ......... 1,26 g/L',
    'HbA1c ................... 7,1 %',
    'Creatinine .............. 9,8 mg/L',
    'Cholesterol total ....... 1,95 g/L',
    '',
    'Document de demonstration - aucune valeur medicale.',
  ]);
  const labPath = path.join(uploadDir, 'analyse-sang.pdf');
  fs.writeFileSync(labPath, labPdf);

  const imagingPdf = minimalPdf([
    'Sehhati - Imagerie medicale (demo)',
    'Patient : Ahmed Berrada',
    'Examen : Radiographie thoracique',
    '',
    'Conclusion : Pas d anomalie pleuro-parenchymateuse',
    'detectee sur ce document de demonstration.',
  ]);
  const imagingPath = path.join(uploadDir, 'radio-thorax.pdf');
  fs.writeFileSync(imagingPath, imagingPdf);

  const consultData = [
    {
      doctorId: drAlami.id,
      patientId: ahmed.id,
      consultedAt: daysAgo(18),
      reason: 'Fatigue persistante et soif intense',
      symptoms: 'Asthénie depuis 3 semaines, polydipsie, nycturie.',
      examination: 'TA 138/86 mmHg, FC 78/min, poids 84 kg. Examen neurologique normal.',
      diagnosis: 'Diabète type 2 déséquilibré',
      treatment: 'Renforcement du traitement antidiabétique, régime hypoglucidique.',
      recommendations: 'Contrôle glycémique 4 fois par jour. Marche 30 min par jour.',
      followUpDate: daysAhead(12),
      prescriptions: [
        { medication: 'Metformine 1000 mg', dosage: '1 comprimé', frequency: '2 fois par jour', duration: '3 mois', notes: 'Pendant les repas' },
        { medication: 'Gliclazide 30 mg', dosage: '1 comprimé', frequency: '1 fois par jour', duration: '1 mois', notes: 'Le matin' },
      ],
      attachments: [
        { fileName: 'analyse-sang.pdf', mimeType: 'application/pdf', sizeBytes: labPdf.length, storagePath: 'seed/analyse-sang.pdf', kind: 'LAB' },
      ],
    },
    {
      doctorId: drBenani.id,
      patientId: ahmed.id,
      consultedAt: daysAgo(63),
      reason: 'Contrôle cardiologique annuel',
      symptoms: 'Aucune douleur thoracique. Essoufflement à l effort important.',
      examination: 'TA 132/84 mmHg, FC 72/min. Auscultation régulière, pas de souffle.',
      diagnosis: 'Hypertension artérielle contrôlée',
      treatment: 'Poursuite du traitement en cours.',
      recommendations: 'Réduire le sel, contrôle de la tension 2 fois par semaine.',
      followUpDate: daysAhead(120),
      prescriptions: [
        { medication: 'Amlodipine 5 mg', dosage: '1 comprimé', frequency: '1 fois par jour', duration: '6 mois', notes: null },
      ],
      attachments: [],
    },
    {
      doctorId: drAlami.id,
      patientId: ahmed.id,
      consultedAt: daysAgo(120),
      reason: 'Douleurs lombaires basses',
      symptoms: 'Lombalgie mécanique depuis 10 jours, sans irradiation.',
      examination: 'Rachis lombaire souple, douleur à la palpation L4-L5. Lasègue négatif.',
      diagnosis: 'Lombalgie mécanique commune',
      treatment: 'Antalgiques et myorelaxants sur courte durée.',
      recommendations: 'Kinésithérapie 10 séances. Éviter le port de charges lourdes.',
      followUpDate: daysAgo(90),
      prescriptions: [
        { medication: 'Paracétamol 1 g', dosage: '1 comprimé', frequency: '3 fois par jour', duration: '5 jours', notes: 'Max 3 g/jour' },
        { medication: 'Thiocolchicoside 4 mg', dosage: '1 gélule', frequency: '2 fois par jour', duration: '5 jours', notes: null },
      ],
      attachments: [
        { fileName: 'radio-thorax.pdf', mimeType: 'application/pdf', sizeBytes: imagingPdf.length, storagePath: 'seed/radio-thorax.pdf', kind: 'IMAGING' },
      ],
    },
    {
      doctorId: drAlami.id,
      patientId: ahmed.id,
      consultedAt: daysAgo(190),
      reason: 'Infection respiratoire',
      symptoms: 'Toux grasse, fièvre 38,2°C, céphalées.',
      examination: 'Auscultation pulmonaire normale. Pharynx légèrement érythémateux.',
      diagnosis: 'Rhinopharyngite virale',
      treatment: 'Traitement symptomatique.',
      recommendations: 'Hydratation, repos, surveillance de la température.',
      followUpDate: null,
      prescriptions: [
        { medication: 'Paracétamol 500 mg', dosage: '1 comprimé', frequency: '3 fois par jour si fièvre', duration: '4 jours', notes: null },
      ],
      attachments: [],
    },
    {
      doctorId: drBenani.id,
      patientId: ahmed.id,
      consultedAt: daysAgo(245),
      reason: 'Palpitations et stress',
      symptoms: 'Palpitations intermittentes, contexte professionnel chargé.',
      examination: 'ECG sinusal à 76/min. Pas d anomalie aiguë.',
      diagnosis: 'Palpitations d origine anxieuse',
      treatment: 'Techniques de respiration, activité physique régulière.',
      recommendations: 'Holter ECG si récidive. Consultation si douleur thoracique.',
      followUpDate: null,
      prescriptions: [],
      attachments: [],
    },
    {
      doctorId: drAlami.id,
      patientId: ahmed.id,
      consultedAt: daysAgo(320),
      reason: 'Bilan de santé annuel',
      symptoms: 'Aucun symptôme particulier.',
      examination: 'Examen général sans particularité. IMC 27,4.',
      diagnosis: 'Bilan annuel — surveillance métabolique',
      treatment: 'Aucun traitement introduit.',
      recommendations: 'Bilan sanguin annuel, activité physique 150 min/semaine.',
      followUpDate: daysAhead(45),
      prescriptions: [],
      attachments: [],
    },
  ];

  let dragged: { id: string; patientId: string | null; consultedAt: Date }[] = [];

  for (let i = 0; i < consultData.length; i++) {
    const c = consultData[i];
    const created = await prisma.consultation.create({
      data: {
        doctorId: c.doctorId,
        patientId: c.patientId,
        status: ConsultationStatus.LINKED,
        consultedAt: c.consultedAt,
        reason: c.reason,
        symptoms: c.symptoms,
        examination: c.examination,
        diagnosis: c.diagnosis,
        treatment: c.treatment,
        recommendations: c.recommendations,
        followUpDate: c.followUpDate,
        linkedAt: c.consultedAt,
        linkMethod: i % 2 === 0 ? LinkMethod.PATIENT_QR : LinkMethod.DOCTOR_CODE,
        prescriptions: {
          create: c.prescriptions.map((p, idx) => ({ ...p, position: idx })),
        },
        attachments: {
          create: c.attachments,
        },
      },
    });
    dragged.push({ id: created.id, patientId: c.patientId, consultedAt: c.consultedAt });
  }

  // Salma — one linked consultation
  await prisma.consultation.create({
    data: {
      doctorId: drAlami.id,
      patientId: salma.id,
      status: ConsultationStatus.LINKED,
      consultedAt: daysAgo(9),
      reason: 'Crise d asthme légère',
      symptoms: 'Sifflements nocturnes, toux sèche.',
      examination: 'Saturation 97%, auscultation avec sibilants diffus.',
      diagnosis: 'Asthme partiellement contrôlé',
      treatment: 'Adaptation du traitement de fond.',
      recommendations: 'Éviter les allergènes, contrôle dans 1 mois.',
      followUpDate: daysAhead(21),
      linkedAt: daysAgo(9),
      linkMethod: LinkMethod.PATIENT_QR,
      prescriptions: {
        create: [
          { medication: 'Ventoline 100 µg', dosage: '2 bouffées', frequency: 'Si besoin', duration: '3 mois', position: 0 },
          { medication: 'Seretide 250 µg', dosage: '1 inhalation', frequency: '2 fois par jour', duration: '3 mois', position: 1 },
        ],
      },
    },
  });

  // Deux consultations terminées non liées
  await prisma.consultation.create({
    data: {
      doctorId: drAlami.id,
      status: ConsultationStatus.COMPLETED,
      consultedAt: daysAgo(0, 9),
      reason: 'Angine et fièvre',
      symptoms: 'Mal de gorge depuis 48 h, fièvre 38,6°C.',
      examination: 'Amygdales érythémateuses avec exsudat. Adénopathies cervicales.',
      diagnosis: 'Angine aiguë probablement bactérienne',
      treatment: 'Antibiothérapie 6 jours.',
      recommendations: 'Hydratation abondante, repos. Consultation si fièvre persistante.',
      followUpDate: daysAhead(6),
      prescriptions: {
        create: [
          { medication: 'Amoxicilline 1 g', dosage: '1 comprimé', frequency: '2 fois par jour', duration: '6 jours', position: 0 },
          { medication: 'Paracétamol 1 g', dosage: '1 comprimé', frequency: '3 fois par jour si fièvre', duration: '5 jours', position: 1 },
        ],
      },
    },
  });

  await prisma.consultation.create({
    data: {
      doctorId: drBenani.id,
      status: ConsultationStatus.COMPLETED,
      consultedAt: daysAgo(1, 15),
      reason: 'Bilan tension artérielle',
      symptoms: 'Céphalées occasionnelles le matin.',
      examination: 'TA 148/94 mmHg à deux reprises. Reste de l examen normal.',
      diagnosis: 'Hypertension artérielle de grade 1',
      treatment: 'Introduction d un traitement antihypertenseur.',
      recommendations: 'Auto-mesure tensionnelle matin et soir pendant 15 jours.',
      followUpDate: daysAhead(15),
      prescriptions: {
        create: [
          { medication: 'Perindopril 5 mg', dosage: '1 comprimé', frequency: '1 fois par jour', duration: '3 mois', position: 0 },
        ],
      },
    },
  });

  // Un brouillon
  await prisma.consultation.create({
    data: {
      doctorId: drAlami.id,
      status: ConsultationStatus.DRAFT,
      consultedAt: daysAgo(0, 8),
      reason: 'Consultation de suivi',
      symptoms: 'À compléter…',
    },
  });

  // Deux consultations IA en attente de relecture (transcription + brouillon fictifs)
  fs.rmSync(path.join(process.cwd(), 'uploads', 'recordings'), { recursive: true, force: true });
  const aiFr = await seedAiReviewConsultation({
    doctorId: drAlami.id,
    doctorUserId: drAlami.userId,
    segments: MOCK_TRANSCRIPT_SEGMENTS,
    language: 'fr',
    retention: true,
    consultedAt: daysAgo(0, 10),
  });
  const aiAr = await seedAiReviewConsultation({
    doctorId: drAlami.id,
    doctorUserId: drAlami.userId,
    segments: DARIJA_TRANSCRIPT_SEGMENTS,
    language: 'ar',
    retention: false,
    consultedAt: daysAgo(0, 11),
  });
  console.log(`Consultations IA à relire : ${aiFr.id} (fr), ${aiAr.id} (ar)`);

  // Grants d'accès au dossier (consentement patient)
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600 * 1000);
  const grantSalmaAlami = await prisma.accessGrant.create({
    data: {
      patientId: salma.id,
      doctorId: drAlami.id,
      scope: AccessScope.FULL,
      expiresAt: hoursFromNow(2),
      lastAccessAt: daysAgo(0, 8),
      accessCount: 3,
    },
  });
  const grantAhmedAlami = await prisma.accessGrant.create({
    data: {
      patientId: ahmed.id,
      doctorId: drAlami.id,
      scope: AccessScope.FULL,
      expiresAt: hoursFromNow(6),
      lastAccessAt: daysAgo(0, 9),
      accessCount: 5,
    },
  });
  const grantAhmedBenani = await prisma.accessGrant.create({
    data: {
      patientId: ahmed.id,
      doctorId: drBenani.id,
      scope: AccessScope.VITALS,
      expiresAt: hoursFromNow(24),
      lastAccessAt: daysAgo(1, 16),
      accessCount: 1,
    },
  });
  await prisma.accessGrant.create({
    data: {
      patientId: salma.id,
      doctorId: drBenani.id,
      scope: AccessScope.FULL,
      expiresAt: daysAgo(1, 10),
      lastAccessAt: daysAgo(2, 9),
      accessCount: 2,
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        userId: drAlami.userId,
        action: 'ACCESS_GRANTED',
        entityType: 'AccessGrant',
        entityId: grantSalmaAlami.id,
        meta: { patientId: salma.id, scope: 'FULL' },
        createdAt: daysAgo(0, 8),
      },
      {
        userId: drAlami.userId,
        action: 'PATIENT_FILE_VIEWED',
        entityType: 'Patient',
        entityId: salma.id,
        meta: { patientId: salma.id, scope: 'FULL', section: 'summary' },
        createdAt: daysAgo(0, 8),
      },
      {
        userId: drAlami.userId,
        action: 'PATIENT_FILE_VIEWED',
        entityType: 'Patient',
        entityId: salma.id,
        meta: { patientId: salma.id, scope: 'FULL', section: 'history' },
        createdAt: daysAgo(0, 9),
      },
      {
        userId: drAlami.userId,
        action: 'ACCESS_GRANTED',
        entityType: 'AccessGrant',
        entityId: grantAhmedAlami.id,
        meta: { patientId: ahmed.id, scope: 'FULL' },
        createdAt: daysAgo(0, 9),
      },
      {
        userId: drBenani.userId,
        action: 'ACCESS_GRANTED',
        entityType: 'AccessGrant',
        entityId: grantAhmedBenani.id,
        meta: { patientId: ahmed.id, scope: 'VITALS' },
        createdAt: daysAgo(1, 15),
      },
      {
        userId: drBenani.userId,
        action: 'PATIENT_FILE_VIEWED',
        entityType: 'Patient',
        entityId: ahmed.id,
        meta: { patientId: ahmed.id, scope: 'VITALS', section: 'summary' },
        createdAt: daysAgo(1, 16),
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: ahmed.userId,
        title: 'Nouvelle consultation ajoutée',
        body: 'Dr. Youssef Alami a ajouté une consultation à votre dossier.',
        href: dragged[0] ? `/patient/consultations/${dragged[0].id}` : null,
        createdAt: daysAgo(18),
      },
      {
        userId: ahmed.userId,
        title: 'Rappel de suivi',
        body: 'Votre prochain contrôle est prévu dans 12 jours.',
        href: '/patient/consultations',
        createdAt: daysAgo(2),
      },
      {
        userId: salma.userId,
        title: 'Nouvelle consultation ajoutée',
        body: 'Dr. Youssef Alami a ajouté une consultation à votre dossier.',
        href: null,
        createdAt: daysAgo(9),
      },
      {
        userId: salma.userId,
        title: 'Accès à votre dossier ouvert',
        body: 'Dr. Youssef Alami a un accès complet à votre dossier.',
        href: '/patient/access',
        createdAt: daysAgo(0, 8),
      },
      {
        userId: ahmed.userId,
        title: 'Accès à votre dossier ouvert',
        body: 'Dr. Youssef Alami a un accès complet à votre dossier.',
        href: '/patient/access',
        createdAt: daysAgo(0, 9),
      },
    ],
  });

  console.log('Seed terminé.');
  console.log('Comptes de démonstration (mot de passe : Demo1234!)');
  console.log(' - dr.alami@demo.ma  (docteur)');
  console.log(' - dr.benani@demo.ma (docteur)');
  console.log(' - ahmed@demo.ma     (patient)');
  console.log(' - salma@demo.ma     (patient)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
