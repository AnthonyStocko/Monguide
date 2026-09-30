import { fetchExternalJson } from '../../http.js';

/**
 * Adaptateur des API au format « chat completions » compatible OpenAI
 * (Mistral, Groq, OpenRouter) : réponse contrainte par un schéma JSON
 * (response_format { type: "json_schema", json_schema: { name, strict, schema } }),
 * texte dans choices[0].message.content, jetons dans usage.prompt_tokens et
 * usage.completion_tokens. Une seule tentative (maxAttempts 1).
 *
 * @param {{ name: string, baseUrl: string, defaultModel: string, headers?: Record<string, string>, body?: Record<string, unknown> }} config
 *   headers, body : en-têtes et champs propres au fournisseur
 * @returns {import('../types.js').AiProvider}
 */
export function openAiCompatibleProvider({ name, baseUrl, defaultModel, headers = {}, body = {} }) {
  return {
    name,
    defaultModel,
    secretName: `AI_API_KEY_${name.toUpperCase()}`,
    async request({ apiKey, model, system, user, jsonSchema, timeoutMs }) {
      const data = await fetchExternalJson(`${baseUrl}/chat/completions`, {
        source: `ai-${name}`,
        method: 'POST',
        timeoutMs,
        maxAttempts: 1,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'response', strict: true, schema: jsonSchema } },
          temperature: 0.2,
          ...body
        })
      });
      const text = data?.choices?.[0]?.message?.content;
      return {
        text: typeof text === 'string' ? text : null,
        usage: { input: data?.usage?.prompt_tokens ?? 0, output: data?.usage?.completion_tokens ?? 0 }
      };
    }
  };
}
