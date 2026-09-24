/**
 * Règles et seuils de Mon guide : valeurs par défaut, SEUL endroit où elles
 * sont écrites. Le serveur peut surcharger n'importe quelle feuille de cet
 * arbre sans redéploiement (table app_config : clé = chemin pointé, par ex.
 * "weather.rainThresholdPct", valeur JSON du même type). L'application reçoit
 * les règles effectives au lancement et garde ces valeurs si le serveur ne
 * répond pas.
 *
 * Conventions : heures "HH:mm" dans le fuseau du séjour, durées en minutes
 * (suffixe Min), secondes (Sec), millisecondes (Ms), distances en km ou m.
 * Les valeurs marquées "proposition" ne sont pas fixées par le cahier des
 * charges et restent à valider.
 */
export const RULES = Object.freeze({
  /** Gabarit de journée : sert uniquement à la génération initiale. */
  dayTemplate: {
    departure: '09:00',
    culture: '10:00',
    lunch: '12:30',
    outdoor: '14:30',
    relax: '17:30'
  },

  /** Plage horaire dans laquelle le déjeuner doit commencer. */
  lunchWindow: {
    start: '12:30',
    end: '14:00'
  },

  /** Durées conseillées et minimales par type d'étape, en minutes (proposition). */
  durations: {
    culture: { recommendedMin: 120, minimumMin: 60 },
    lunch: { recommendedMin: 90, minimumMin: 45 },
    outdoor: { recommendedMin: 150, minimumMin: 60 },
    relax: { recommendedMin: 90, minimumMin: 30 },
    personal: { recommendedMin: 60, minimumMin: 15 }
  },

  /** Trajets : toujours des estimations (aucun moteur d'itinéraire). */
  travel: {
    /** Distance réelle ≈ distance à vol d'oiseau × coefficient de détour. */
    detourFactor: 1.3,
    /** Trajet maximal entre deux étapes. */
    maxTravelMin: 45,
    /** Vitesse moyenne (km/h) et rayon de recherche (km) par mode (proposition). */
    modes: {
      walk: { speedKmh: 4.5, radiusKm: 3 },
      transit: { speedKmh: 18, radiusKm: 15 },
      bike: { speedKmh: 15, radiusKm: 10 },
      car: { speedKmh: 40, radiusKm: 40 }
    }
  },

  /** Au-delà de cette probabilité de pluie (%), une activité en extérieur est déconseillée. */
  weather: {
    rainThresholdPct: 50
  },

  schedule: {
    /** La dernière étape de la journée doit commencer au plus tard à cette heure. */
    lastStepLatestStart: '19:00',
    /** Au-delà, la journée est signalée comme finissant tard. */
    lateEnd: '21:00'
  },

  places: {
    /** Deux lieux à moins de cette distance (m) sont considérés comme un seul. */
    dedupDistanceM: 50,
    /** Taille maximale de la réserve de lieux non utilisés d'un séjour (Trip.candidates). */
    maxCandidates: 60,
    /** Valeurs OSM "cuisine" considérées comme régionales (proposition, À VÉRIFIER en phase 2). */
    regionalCuisines: ['regional', 'local', 'traditional']
  },

  lodging: {
    /** Hébergement éloigné : au-delà de ce facteur × rayon de la destination. */
    farFactor: 1.5
  },

  notifications: {
    /** Heure du résumé envoyé la veille de chaque journée. */
    eveningSummaryTime: '19:00',
    /** Délai du rappel avant une étape, en minutes. */
    reminderLeadMin: 60
  },

  ui: {
    /** Délai pendant lequel une action peut être annulée. */
    undoDelaySec: 10
  },

  storage: {
    /** Taille maximale du cache local de l'application. */
    localCacheMaxMb: 20
  },

  /** Appels de l'application vers le serveur. */
  api: {
    timeoutMs: 10000,
    generateTimeoutMs: 25000
  },

  /** Appels du serveur vers les API externes (module _shared/http.js). */
  http: {
    timeoutMs: 10000,
    maxAttempts: 2,
    /** Pause avant la nouvelle tentative. */
    retryDelayMs: 500
  },

  /** Limites de requêtes par client (utilisateur connecté ou empreinte d'IP). */
  rateLimits: {
    windowMin: 60,
    generatePerWindow: 30,
    otherPerWindow: 600
  },

  /** Durées de cache côté serveur, par source, en secondes (proposition hors config). */
  cacheTtlSec: {
    config: 300,
    geocode: 2592000,
    weather: 3600,
    places: 604800,
    fuel: 86400
  }
});
