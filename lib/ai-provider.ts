import type { ExplanationProvider } from './explanation-generation';

// Shared with the existing question explanation service; no separate model settings.
export function configuredExplanationProvider(settings: Record<string, unknown>): ExplanationProvider {
  const get = (key: string) => typeof settings[key] === 'string' ? settings[key] as string : undefined;
  if (get('AI_PROVIDER') === 'deepseek') return { apiKey: get('DEEPSEEK_API_KEY'), baseUrl: get('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com', apiStyle: 'chat_completions', model: get('DEEPSEEK_VISION_MODEL') || 'deepseek-flash', strictJsonSchema: false };
  return { apiKey: get('OPENAI_API_KEY'), baseUrl: get('OPENAI_BASE_URL') || 'https://api.openai.com/v1', apiStyle: get('OPENAI_API_STYLE') || 'responses', model: get('OPENAI_VISION_MODEL') || get('OPENAI_CLASSIFICATION_MODEL') || 'gpt-4o-mini', strictJsonSchema: true };
}
