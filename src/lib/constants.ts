export const SPECIALTIES = [
  'Médecine générale',
  'Cardiologie',
  'Dermatologie',
  'Pédiatrie',
  'Gynécologie',
  'Ophtalmologie',
  'ORL',
  'Neurologie',
  'Orthopédie',
  'Psychiatrie',
  'Endocrinologie',
  'Gastro-entérologie',
  'Pneumologie',
  'Urologie',
  'Rhumatologie',
  'Autre',
] as const;

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const GENDERS = [
  { value: 'M', labelFr: 'Homme', labelAr: 'ذكر' },
  { value: 'F', labelFr: 'Femme', labelAr: 'أنثى' },
] as const;

export const ATTACHMENT_KINDS = ['LAB', 'IMAGING', 'PRESCRIPTION', 'OTHER'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Palette des pastilles d’icônes (design system). */
export const BUBBLE_COLORS = ['rose', 'peach', 'sky', 'violet', 'mint', 'yellow'] as const;
export type BubbleColor = (typeof BUBBLE_COLORS)[number];

export const DEMO_ACCOUNTS = {
  patient: 'ahmed@demo.ma',
  doctor: 'dr.alami@demo.ma',
  password: 'Demo1234!',
};
