import type {
  ExtractionData,
  ExtractionField,
  TranscriptSegment,
} from '@/lib/ai/types';
import { buildExtractionPrompt, buildSectionPrompt } from '@/lib/ai/extraction/prompt';
import { mockExtraction } from '@/lib/ai/extraction/mock';
import { parseExtraction } from '@/lib/ai/extraction/schema';
import { verifyExtraction } from '@/lib/ai/extraction/verify';

export type ExtractionRequest = {
  segments: TranscriptSegment[];
  language: string;
};

export type SectionRequest = ExtractionRequest & {
  field: ExtractionField;
};

export type ExtractionResponse = {
  data: unknown;
  raw?: unknown;
  model?: string | null;
};

export interface ExtractionProvider {
  name: string;
  model?: string | null;
  extract(request: ExtractionRequest): Promise<ExtractionResponse>;
  extractSection?(request: SectionRequest): Promise<{ value: string; evidence: string[] }>;
}

function stripJsonFences(text: string) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonObject(text: string): unknown {
  const cleaned = stripJsonFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('LLM_JSON_INVALID');
  }
}

class MockProvider implements ExtractionProvider {
  name = 'mock';
  model = 'mock-rule-based-v1';

  async extract({ segments }: ExtractionRequest) {
    return { data: mockExtraction(segments), model: this.model };
  }

  async extractSection({ segments, field }: SectionRequest) {
    const data = mockExtraction(segments);
    return { value: data[field].value, evidence: data[field].evidence };
  }
}

class OpenAIProvider implements ExtractionProvider {
  name = 'openai';
  model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
    this.model = process.env.LLM_MODEL ?? 'gpt-4o-mini';
    this.baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    if (!this.apiKey) throw new Error('LLM_API_KEY_MISSING');
  }

  private async chat(system: string, user: string) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`LLM_HTTP_${response.status}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? '';
    return parseJsonObject(content);
  }

  async extract(request: ExtractionRequest) {
    const prompt = buildExtractionPrompt(request);
    const data = await this.chat(prompt.system, prompt.user);
    return { data, model: this.model };
  }

  async extractSection(request: SectionRequest) {
    const prompt = buildSectionPrompt(request);
    const data = (await this.chat(prompt.system, prompt.user)) as {
      value?: unknown;
      evidence?: unknown;
    };
    return {
      value: typeof data.value === 'string' ? data.value : '',
      evidence: Array.isArray(data.evidence)
        ? data.evidence.filter((id): id is string => typeof id === 'string')
        : [],
    };
  }
}

class AnthropicProvider implements ExtractionProvider {
  name = 'anthropic';
  model: string;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.LLM_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = process.env.LLM_MODEL ?? 'claude-3-5-sonnet-latest';
    if (!this.apiKey) throw new Error('LLM_API_KEY_MISSING');
  }

  private async chat(system: string, user: string) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!response.ok) {
      throw new Error(`LLM_HTTP_${response.status}`);
    }
    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const content = payload.content?.find((item) => item.type === 'text')?.text ?? '';
    return parseJsonObject(content);
  }

  async extract(request: ExtractionRequest) {
    const prompt = buildExtractionPrompt(request);
    const data = await this.chat(prompt.system, prompt.user);
    return { data, model: this.model };
  }

  async extractSection(request: SectionRequest) {
    const prompt = buildSectionPrompt(request);
    const data = (await this.chat(prompt.system, prompt.user)) as {
      value?: unknown;
      evidence?: unknown;
    };
    return {
      value: typeof data.value === 'string' ? data.value : '',
      evidence: Array.isArray(data.evidence)
        ? data.evidence.filter((id): id is string => typeof id === 'string')
        : [],
    };
  }
}

class OllamaProvider implements ExtractionProvider {
  name = 'ollama';
  model: string;
  private baseUrl: string;

  constructor() {
    this.model = process.env.LLM_MODEL ?? 'llama3.1:8b';
    this.baseUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  }

  private async chat(system: string, user: string) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`LLM_HTTP_${response.status}`);
    }
    const payload = (await response.json()) as { message?: { content?: string } };
    return parseJsonObject(payload.message?.content ?? '');
  }

  async extract(request: ExtractionRequest) {
    const prompt = buildExtractionPrompt(request);
    const data = await this.chat(prompt.system, prompt.user);
    return { data, model: this.model };
  }

  async extractSection(request: SectionRequest) {
    const prompt = buildSectionPrompt(request);
    const data = (await this.chat(prompt.system, prompt.user)) as {
      value?: unknown;
      evidence?: unknown;
    };
    return {
      value: typeof data.value === 'string' ? data.value : '',
      evidence: Array.isArray(data.evidence)
        ? data.evidence.filter((id): id is string => typeof id === 'string')
        : [],
    };
  }
}

export function getExtractionProvider(name = process.env.LLM_PROVIDER ?? 'mock'): ExtractionProvider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'ollama':
      return new OllamaProvider();
    case 'mock':
    default:
      return new MockProvider();
  }
}

export async function runExtraction(request: ExtractionRequest): Promise<{
  data: ExtractionData;
  unverifiedFields: string[];
  warnings: ReturnType<typeof verifyExtraction>['warnings'];
  fieldSources: Record<string, string[]>;
  provider: string;
  model: string | null;
  promptVersion: string;
}> {
  const provider = getExtractionProvider();
  const response = await provider.extract(request);
  const parsed = parseExtraction(response.data);
  const verified = verifyExtraction(parsed, request.segments);
  return {
    ...verified,
    provider: provider.name,
    model: response.model ?? provider.model ?? null,
    promptVersion: process.env.PROMPT_VERSION ?? 'v1',
  };
}

export async function runSectionExtraction(
  request: SectionRequest,
): Promise<{ value: string; evidence: string[]; unverified: boolean; warning?: string }> {
  const provider = getExtractionProvider();
  if (!provider.extractSection) {
    throw new Error('SECTION_EXTRACTION_UNSUPPORTED');
  }
  const result = await provider.extractSection(request);
  const single: ExtractionData = parseExtraction({
    ...emptyShape(),
    [request.field]: { value: result.value, evidence: result.evidence },
  });
  const verified = verifyExtraction(single, request.segments);
  const value = verified.data[request.field].value;
  return {
    value,
    evidence: verified.data[request.field].evidence,
    unverified: verified.unverifiedFields.includes(request.field),
    warning: verified.warnings.find((warning) => warning.field === request.field)?.message,
  };
}

function emptyShape() {
  const make = () => ({ value: '', evidence: [] as string[] });
  return {
    reason: make(),
    symptoms: make(),
    examination: make(),
    diagnosis: make(),
    treatment: make(),
    recommendations: make(),
    followUpDate: make(),
    prescriptions: [],
    missingFields: [],
    uncertainPassages: [],
  };
}
