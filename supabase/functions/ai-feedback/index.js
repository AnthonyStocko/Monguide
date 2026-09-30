import { FEEDBACK_EVENTS } from '../_shared/ai/reviewStats.js';
import { addReviewStats } from '../_shared/ai/usageStore.js';
import { serveFunction } from '../_shared/handler.js';
import { log } from '../_shared/log.js';
import { readEnum, readJsonBody } from '../_shared/validate.js';

// POST /functions/v1/ai-feedback { event: "revert_original" | "revert_reviewed" } -> { ok }
// Compteur anonyme (table ai_review_stats) : ni contenu, ni séjour, ni identifiant de client.
serveFunction({
  name: 'ai-feedback',
  methods: ['POST'],
  handle: async ({ req }) => {
    const body = await readJsonBody(req);
    const event = readEnum(body.event, 'event', Object.keys(FEEDBACK_EVENTS));
    try {
      await addReviewStats({ [FEEDBACK_EVENTS[event]]: 1 });
    } catch (err) {
      // Compteur indisponible : jamais une erreur pour l'application.
      log('warn', 'ai_stats_failed', { message: String(err?.message ?? err) });
    }
    return { ok: true };
  }
});
