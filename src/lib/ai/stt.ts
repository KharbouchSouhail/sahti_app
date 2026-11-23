import fs from 'node:fs/promises';
import type { Speaker, TranscriptData, TranscriptSegment } from '@/lib/ai/types';
import {
  MOCK_TRANSCRIPT_LANGUAGE,
  MOCK_TRANSCRIPT_SEGMENTS,
} from '@/lib/ai/mock-transcript';

export interface SpeechToTextProvider {
  name: string;
  model?: string | null;
  transcribe(input: {
    audioPath: string;
    mimeType: string;
    languageHint?: string;
  }): Promise<TranscriptData>;
}

function normalizeSpeaker(value: unknown): Speaker {
  if (typeof value !== 'string') return 'UNKNOWN';
  const upper = value.toUpperCase();
  if (upper.includes('DOCTOR') || upper.includes('MEDECIN') || upper.includes('MÉDECIN')) {
    return 'DOCTOR';
  }
  if (upper.includes('PATIENT')) return 'PATIENT';
  return 'UNKNOWN';
}

function normalizeSegments(
  raw: Array<{
    id?: string;
    start?: number;
    end?: number;
    speaker?: string;
    text?: string;
    confidence?: number;
  }>,
): TranscriptSegment[] {
  return raw
    .filter((segment) => typeof segment.text === 'string' && segment.text.trim().length > 0)
    .map((segment, index) => ({
      id: segment.id?.trim() || `s${index + 1}`,
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? segment.start ?? 0),
      speaker: normalizeSpeaker(segment.speaker),
      text: segment.text!.trim(),
      confidence:
        typeof segment.confidence === 'number' ? segment.confidence : undefined,
    }));
}

class MockSttProvider implements SpeechToTextProvider {
  name = 'mock';
  model = 'demo-transcript';

  async transcribe(): Promise<TranscriptData> {
    const segments = MOCK_TRANSCRIPT_SEGMENTS.map((segment) => ({ ...segment }));
    return {
      language: MOCK_TRANSCRIPT_LANGUAGE,
      text: segments.map((segment) => segment.text).join(' '),
      segments,
      provider: this.name,
      model: this.model,
    };
  }
}

class AiServiceSttProvider implements SpeechToTextProvider {
  name = 'ai-service';
  model = 'faster-whisper-large-v3';
  private url: string;

  constructor() {
    this.url = (process.env.STT_SERVICE_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  }

  async transcribe(input: {
    audioPath: string;
    mimeType: string;
    languageHint?: string;
  }): Promise<TranscriptData> {
    const buffer = await fs.readFile(input.audioPath);
    const form = new FormData();
    form.append(
      'audio',
      new Blob([new Uint8Array(buffer)], { type: input.mimeType || 'audio/webm' }),
      'consultation.webm',
    );
    if (input.languageHint) form.append('language', input.languageHint);

    const response = await fetch(`${this.url}/transcribe`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!response.ok) {
      throw new Error(`STT_HTTP_${response.status}`);
    }
    const payload = (await response.json()) as {
      language?: string;
      text?: string;
      segments?: Parameters<typeof normalizeSegments>[0];
    };
    const segments = normalizeSegments(payload.segments ?? []);
    return {
      language: payload.language ?? 'fr',
      text: payload.text ?? segments.map((segment) => segment.text).join(' '),
      segments,
      provider: this.name,
      model: this.model,
    };
  }
}

class OpenAiSttProvider implements SpeechToTextProvider {
  name = 'openai';
  model = 'whisper-1';

  async transcribe(input: {
    audioPath: string;
    mimeType: string;
    languageHint?: string;
  }): Promise<TranscriptData> {
    const apiKey = process.env.STT_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY;
    if (!apiKey) throw new Error('STT_API_KEY_MISSING');

    const buffer = await fs.readFile(input.audioPath);
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: input.mimeType || 'audio/webm' }),
      'consultation.webm',
    );
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    if (input.languageHint) form.append('language', input.languageHint);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!response.ok) throw new Error(`STT_HTTP_${response.status}`);

    const payload = (await response.json()) as {
      language?: string;
      text?: string;
      segments?: Parameters<typeof normalizeSegments>[0];
    };
    const segments = normalizeSegments(payload.segments ?? []);
    return {
      language: payload.language ?? 'fr',
      text: payload.text ?? '',
      segments,
      provider: this.name,
      model: this.model,
    };
  }
}

export function getSttProvider(name = process.env.STT_PROVIDER ?? 'mock'): SpeechToTextProvider {
  switch (name) {
    case 'ai-service':
      return new AiServiceSttProvider();
    case 'openai':
      return new OpenAiSttProvider();
    case 'mock':
    default:
      return new MockSttProvider();
  }
}

export async function transcribeRecording(input: {
  audioPath: string;
  mimeType: string;
  languageHint?: string;
}): Promise<TranscriptData> {
  const provider = getSttProvider();
  const result = await provider.transcribe(input);
  return {
    ...result,
    segments: result.segments.length > 0 ? result.segments : [],
  };
}
