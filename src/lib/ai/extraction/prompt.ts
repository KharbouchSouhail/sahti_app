import type { ExtractionField, TranscriptSegment } from '@/lib/ai/types';

export const PROMPT_VERSION = 'v1';

const SYSTEM = `Tu es un assistant de documentation médicale pour un médecin au Maroc.
Tu transformes une transcription de consultation en brouillon structuré.

RÈGLES ABSOLUES — à respecter sans exception :
1. N'invente JAMAIS aucune information. Si une information n'a pas été dite explicitement, sa valeur est la chaîne vide "".
2. Un champ vide ne veut pas dire « aucun » : il veut dire « non mentionné ». N'écris jamais « Aucun », « Néant », « RAS » ou « Non ».
3. Le diagnostic, le traitement et les prescriptions ne doivent apparaître QUE si le MÉDECIN les a explicitement énoncés. Une hypothèse du patient n'est pas un diagnostic.
4. Si le patient cite un médicament qu'il a déjà pris, ne le prescris pas.
5. Respecte les négations : « pas de fièvre », « aucune douleur », « لا يوجد » ne deviennent jamais un symptôme.
6. Chaque valeur non vide doit citer les identifiants de segments qui la justifient (evidence). N'invente pas d'identifiant.
7. Pour chaque médicament prescrit, reprends exactement le nom, le dosage, la fréquence et la durée dits par le médecin. Si un élément n'est pas dit, laisse "".
8. En cas de passage ambigu, ajoute-le à uncertainPassages au lieu de compléter arbitrairement.
9. N'inclus ni nom de patient, ni identifiant, ni date de naissance dans ta réponse.
10. Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises Markdown.

FORMAT JSON ATTENDU :
{
  "reason": { "value": "", "evidence": [] },
  "symptoms": { "value": "", "evidence": [] },
  "examination": { "value": "", "evidence": [] },
  "diagnosis": { "value": "", "evidence": [] },
  "treatment": { "value": "", "evidence": [] },
  "recommendations": { "value": "", "evidence": [] },
  "followUpDate": { "value": "", "evidence": [] },
  "prescriptions": [
    { "medication": "", "dosage": "", "frequency": "", "duration": "", "notes": null, "evidence": [] }
  ],
  "missingFields": [],
  "uncertainPassages": [
    { "text": "", "reason": "", "segmentIds": [] }
  ]
}`;

function renderTranscript(segments: TranscriptSegment[]) {
  return segments
    .map((segment) => `[${segment.id}] ${segment.speaker}: ${segment.text}`)
    .join('\n');
}

export function buildExtractionPrompt(input: {
  segments: TranscriptSegment[];
  language: string;
}) {
  const user = `Langue principale de la consultation : ${input.language || 'fr'}.
La transcription peut mélanger arabe, darija et français. Conserve la langue réellement parlée dans les valeurs.

TRANSCRIPTION (une ligne par segment, l'identifiant entre crochets) :
${renderTranscript(input.segments)}

Produis maintenant le JSON du brouillon. Rappelle-toi : aucune invention, valeurs vides si non dites.`;

  return { system: SYSTEM, user };
}

const FIELD_INSTRUCTIONS: Record<ExtractionField, string> = {
  reason: 'le motif principal de consultation, tel que formulé par le patient ou le médecin',
  symptoms: 'les symptômes réellement rapportés, en excluant les symptômes niés',
  examination: "les constatations de l'examen clinique faites par le médecin (constantes, auscultation…)",
  diagnosis: 'le diagnostic explicitement énoncé par le médecin',
  treatment: 'le traitement explicitement décidé par le médecin (hors lignes de prescription détaillées)',
  recommendations: 'les conseils et recommandations donnés par le médecin',
  followUpDate: 'la date ou le délai de prochain contrôle explicitement énoncé, au format AAAA-MM-JJ si possible',
};

export function buildSectionPrompt(input: {
  field: ExtractionField;
  segments: TranscriptSegment[];
  language: string;
}) {
  const user = `Langue principale : ${input.language || 'fr'}.

TRANSCRIPTION :
${renderTranscript(input.segments)}

Extrais uniquement ${FIELD_INSTRUCTIONS[input.field]}.
Si l'information n'est pas explicitement présente, renvoie une valeur vide.
Réponds uniquement par : { "value": "", "evidence": [] }`;

  return { system: SYSTEM, user };
}
