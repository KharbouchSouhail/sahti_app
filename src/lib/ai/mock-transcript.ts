import type { TranscriptSegment } from '@/lib/ai/types';

/**
 * Transcription de démonstration utilisée quand STT_PROVIDER=mock.
 * Elle contient volontairement :
 *  - une négation (« pas de toux »),
 *  - un médicament cité par la patiente mais non prescrit (Ibuprofène),
 *  - deux prescriptions explicites du médecin.
 */
export const MOCK_TRANSCRIPT_SEGMENTS: TranscriptSegment[] = [
  {
    id: 's1',
    start: 0,
    end: 7,
    speaker: 'PATIENT',
    text: "Bonjour docteur, j'ai mal à la gorge depuis trois jours et j'ai un peu de fièvre.",
    confidence: 0.94,
  },
  {
    id: 's2',
    start: 7,
    end: 12,
    speaker: 'DOCTOR',
    text: 'Bonjour, je vous écoute. Pas de toux sèche ?',
    confidence: 0.96,
  },
  {
    id: 's3',
    start: 12,
    end: 19,
    speaker: 'PATIENT',
    text: "Non, pas de toux. J'ai pris de l'Ibuprofène hier soir, ça n'a rien changé.",
    confidence: 0.91,
  },
  {
    id: 's4',
    start: 19,
    end: 30,
    speaker: 'DOCTOR',
    text: "D'accord. À l'examen, la température est à 38,2 degrés et les amygdales sont rouges avec un exsudat.",
    confidence: 0.93,
  },
  {
    id: 's5',
    start: 30,
    end: 38,
    speaker: 'DOCTOR',
    text: 'Le diagnostic est une angine aiguë probablement bactérienne.',
    confidence: 0.95,
  },
  {
    id: 's6',
    start: 38,
    end: 50,
    speaker: 'DOCTOR',
    text: 'Je vous prescris de l’Amoxicilline 1 g, un comprimé deux fois par jour pendant six jours.',
    confidence: 0.92,
  },
  {
    id: 's7',
    start: 50,
    end: 63,
    speaker: 'DOCTOR',
    text: 'Prenez aussi du Paracétamol 1 g, un comprimé trois fois par jour si fièvre, pendant cinq jours.',
    confidence: 0.9,
  },
  {
    id: 's8',
    start: 63,
    end: 76,
    speaker: 'DOCTOR',
    text: "En recommandations, buvez beaucoup d'eau, reposez-vous et consultez si la fièvre persiste après trois jours.",
    confidence: 0.93,
  },
  {
    id: 's9',
    start: 76,
    end: 82,
    speaker: 'DOCTOR',
    text: "Revoyez-moi dans une semaine si ça ne s'améliore pas.",
    confidence: 0.88,
  },
];

export const MOCK_TRANSCRIPT_LANGUAGE = 'fr';

export function mockTranscriptText(segments = MOCK_TRANSCRIPT_SEGMENTS) {
  return segments.map((segment) => segment.text).join(' ');
}
