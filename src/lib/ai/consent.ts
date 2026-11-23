import type { ConsentType } from '@prisma/client';

export type ConsentInput = {
  audio: boolean;
  aiProcessing: boolean;
  retention: boolean;
  patientRefused: boolean;
};

export type ConsentValidation =
  | { ok: true; manual: boolean; types: ConsentType[] }
  | { ok: false; code: 'CONSENT_REQUIRED' };

/**
 * Le consentement audio + traitement IA est obligatoire avant tout enregistrement.
 * La rétention audio est un choix distinct, facultatif.
 * Un refus du patient bascule vers le mode manuel, sans enregistrement.
 */
export function validateConsent(input: ConsentInput): ConsentValidation {
  if (input.patientRefused) {
    return { ok: true, manual: true, types: [] };
  }
  if (!input.audio || !input.aiProcessing) {
    return { ok: false, code: 'CONSENT_REQUIRED' };
  }
  const types: ConsentType[] = ['AUDIO', 'AI_PROCESSING'];
  if (input.retention) types.push('RETENTION');
  return { ok: true, manual: false, types };
}

export function hasRecordingConsent(
  consents: Array<{ type: ConsentType; granted: boolean }>,
) {
  const granted = new Set(
    consents.filter((consent) => consent.granted).map((consent) => consent.type),
  );
  return granted.has('AUDIO') && granted.has('AI_PROCESSING');
}
