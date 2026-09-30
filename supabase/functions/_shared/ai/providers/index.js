import { fetchExternalJson } from '../../http.js';
import { openAiCompatibleProvider } from './openaiCompatible.js';

/**
 * Fournisseurs disponibles (rules.ai.provider). API, modèles et mode JSON
 * vérifiés dans la documentation de chaque fournisseur le 2026-09-30 ; offres
 * gratuites et limites : À VÉRIFIER dans la console de chaque fournisseur
 * (elles changent souvent). Clé d'API : secret AI_API_KEY_<NOM>.
 */

/** Mistral AI (hébergement dans l'Union européenne) : docs.mistral.ai, API chat completions. */
export const mistral = openAiCompatibleProvider({
  name: 'mistral',
  baseUrl: 'https://api.mistral.ai/v1',
  defaultModel: 'mistral-small-latest'
});

/** Groq : console.groq.com/docs ; schéma strict pris en charge par openai/gpt-oss-120b et -20b. */
export const groq = openAiCompatibleProvider({
  name: 'groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  defaultModel: 'openai/gpt-oss-120b'
});

/**
 * OpenRouter : openrouter.ai/docs. require_parameters : n'utiliser qu'un
 * hébergeur du modèle qui respecte le schéma. Modèle gratuit (suffixe
 * ":free") : À VÉRIFIER sur openrouter.ai/models (filtre structured_outputs).
 */
export const openrouter = openAiCompatibleProvider({
  name: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'openai/gpt-oss-120b:free',
  headers: { 'X-Title': 'Mon guide' },
  body: { provider: { require_parameters: true } }
});

/**
 * Google Gemini : ai.google.dev/api/generate-content ; clé dans l'en-tête
 * x-goog-api-key (jamais dans l'URL), réponse JSON contrainte par
 * generationConfig.responseJsonSchema, texte dans
 * candidates[0].content.parts[].text, jetons dans usageMetadata.
 * @type {import('../types.js').AiProvider}
 */
export const gemini = {
  name: 'gemini',
  defaultModel: 'gemini-3.8-flash',
  secretName: 'AI_API_KEY_GEMINI',
  async request({ apiKey, model, system, user, jsonSchema, timeoutMs }) {
    const data = await fetchExternalJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      source: 'ai-gemini',
      method: 'POST',
      timeoutMs,
      maxAttempts: 1,
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: jsonSchema, temperature: 0.2 }
      })
    });
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => p?.text ?? '').join('') : null;
    return {
      text: text || null,
      usage: { input: data?.usageMetadata?.promptTokenCount ?? 0, output: data?.usageMetadata?.candidatesTokenCount ?? 0 }
    };
  }
};

/** Aucun fournisseur : relecture désactivée, aucun appel réseau. */
export const off = {
  name: 'off',
  defaultModel: '',
  secretName: null,
  async request() {
    throw new Error('Fournisseur "off" : aucun appel');
  }
};

export const AI_PROVIDERS = Object.freeze({ mistral, groq, openrouter, gemini, off });
