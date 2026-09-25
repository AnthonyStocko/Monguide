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
  /**
   * Gabarit de journée : horaires de la génération initiale. departure sert
   * aussi de départ conseillé quand une journée commence par un temps libre.
   */
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

  /**
   * Durées par type d'activité, en minutes : conseillée (durée par défaut
   * d'une étape) et minimale (en dessous, l'étape n'a plus de sens).
   */
  durations: {
    museum: { recommendedMin: 90, minimumMin: 60 },
    castle: { recommendedMin: 120, minimumMin: 75 },
    /** monument, église */
    monument: { recommendedMin: 60, minimumMin: 30 },
    /** petit patrimoine, point de vue */
    smallHeritage: { recommendedMin: 30, minimumMin: 15 },
    /** parc, espace naturel */
    park: { recommendedMin: 90, minimumMin: 45 },
    /** sentier, randonnée */
    trail: { recommendedMin: 120, minimumMin: 90 },
    /** marché, producteur */
    market: { recommendedMin: 45, minimumMin: 30 },
    restaurant: { recommendedMin: 75, minimumMin: 60 },
    /** détente, temps libre */
    relax: { recommendedMin: 60, minimumMin: 30 }
  },

  /** Trajets : toujours des estimations (aucun moteur d'itinéraire). */
  travel: {
    /** Distance réelle ≈ distance à vol d'oiseau × coefficient de détour. */
    detourFactor: 1.3,
    /** Trajet maximal entre deux étapes : au-delà, un autre lieu est choisi. */
    maxTravelMin: 45,
    /**
     * Vitesse moyenne (km/h, attente comprise en transports en commun) et
     * rayon effectif (km) par mode. Le rayon effectif ne dépasse jamais le
     * rayon d'exploration choisi ; null = rayon choisi (voiture).
     */
    modes: {
      walk: { speedKmh: 5, radiusKm: 3 },
      transit: { speedKmh: 20, radiusKm: 20 },
      bike: { speedKmh: 15, radiusKm: 15 },
      car: { speedKmh: 50, radiusKm: null }
    }
  },

  /** Génération d'un séjour (fonction generate). */
  generation: {
    /** Budget de collecte des données : au-delà, génération avec les sources disponibles (ms). */
    collectBudgetMs: 16000,
    /**
     * Score d'un lieu (0-100) = proximité (rapportée au rayon effectif du mode)
     * + bonus certifié + bonus de diversité des catégories.
     */
    score: {
      proximity: 60,
      certified: 25,
      diversity: 15,
      /** Malus d'un lieu sans nom (nom générique : « Point de vue »…), qui ne sert qu'à combler un créneau. */
      unnamedPenalty: 20
    },
    /** Score d'un restaurant : bonus et malus (points). */
    restaurant: {
      base: 40,
      regionalCuisine: 15,
      proximity: 45,
      hoursUnconfirmed: 15,
      infoMissing: 10
    }
  },

  /** Comptes : connexion par code reçu par e-mail. */
  auth: {
    /** Nombre de chiffres du code (réglage Supabase "Email OTP Length" à aligner). */
    otpLength: 6,
    /** Délai avant de pouvoir redemander un code, en secondes. */
    resendDelaySec: 60
  },

  /** Synchronisation des séjours : délai après une modification avant l'envoi (ms). */
  sync: {
    debounceMs: 1500,
    // Durée de conservation, sur le serveur, des marqueurs de séjours supprimés
    // (reprise dans la tâche pg_cron monguide-purge-deleted-trips).
    deletedRetentionDays: 90
  },

  /** Carburant : consommation par défaut d'une voiture (modifiable par séjour). */
  fuel: {
    defaultConsumptionL100: 6.5
  },

  weather: {
    /** Au-delà de cette probabilité de pluie (%), une activité en extérieur est déconseillée. */
    rainThresholdPct: 50,
    /** Jours de prévision disponibles (aujourd'hui compris) : au-delà, météo prise en compte plus tard. */
    forecastDays: 16
  },

  /** Formulaire de création de séjour. */
  trip: {
    /** Rayons d'exploration proposés, en km. */
    radiusOptionsKm: [5, 10, 20, 40],
    defaultRadiusKm: 10,
    /** Durée maximale d'un séjour, en jours (arrivée et départ compris). */
    maxDays: 7,
    /** Nombre maximal de voyageurs (proposition). */
    maxTravelers: 20
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
    /** Rayon de recherche maximal accepté par la fonction places, en km. */
    maxRadiusKm: 50,
    /** Valeurs OSM "cuisine" qui rendent un restaurant "régional". */
    regionalCuisines: ['regional', 'french']
  },

  /** Recherche de destination (fonction geocode). */
  geocode: {
    /** Nombre minimal de caractères avant d'interroger le serveur. */
    minChars: 3,
    /** Délai sans frappe avant l'appel (debounce), en ms. */
    debounceMs: 300,
    /** Nombre maximal de résultats renvoyés. */
    maxResults: 10
  },

  /**
   * Requête Overpass (lieux OpenStreetMap). Exception à la règle HTTP : un
   * seul essai, délai strict, jamais de nouvelle tentative (429 et 504
   * aggravent le blocage si l'on réessaie).
   */
  osm: {
    /** Délai côté serveur Overpass ([timeout:N]) et côté client, en secondes. */
    timeoutSec: 8,
    /** Les restaurants sont cherchés dans un rayon réduit (déjeuner à proximité), en km (proposition). */
    restaurantRadiusKm: 10,
    /** Nombre maximal de résultats par groupe (200 au total). */
    limits: { food: 80, local: 40, nature: 40, heritage: 40 },
    /**
     * Source des lieux OSM : "tiles" (tuiles statiques du bucket osm-tiles),
     * "overpass" (requête Overpass, secret OVERPASS_URL) ou "off" (aucun lieu
     * OSM, ni repli du patrimoine). Toute autre valeur vaut "tiles".
     */
    source: 'tiles',
    /**
     * Petit patrimoine et points de vue SANS NOM gardés (sous-catégories des
     * tuiles), avec un nom générique traduit et un score plus bas
     * (generation.score.unnamedPenalty). Calvaires et monuments aux morts
     * anonymes exclus : trop nombreux et peu intéressants.
     */
    unnamedTypes: ['viewpoint', 'lavoir', 'ruins'],
    /** Tuiles de lieux (docs/osm-tiles.md). */
    tiles: {
      /** Relecture de current.json (version en service), en secondes. */
      pointerTtlSec: 3600,
      /** Tuiles décompressées gardées en mémoire par instance de fonction, en Mo de JSON. */
      memoryCacheMb: 40,
      /**
       * Côté des cases de la grille, en degrés, utilisé à la génération des
       * tuiles (0,2 retenu à l'étude des volumes : ~10 tuiles lues pour 20 km).
       * La lecture suit le cellDeg du manifeste en service, pas cette valeur.
       */
      cellDeg: 0.2
    }
  },

  /**
   * Requêtes Wikidata (patrimoine hors de France). Exception à la règle HTTP :
   * délai client de 15 s, jamais de nouvelle tentative (429 compris).
   */
  wikidata: {
    timeoutSec: 15,
    /** LIMIT de chaque requête SPARQL. */
    limit: 300
  },

  terroir: {
    /** Communes voisines prises en compte autour de la destination, en km (proposition). */
    neighborRadiusKm: 10
  },

  lodging: {
    /** Hébergement éloigné : au-delà de ce facteur × rayon de la destination. */
    farFactor: 1.5
  },

  /** Étapes personnelles ajoutées par l'utilisateur. */
  personalStep: {
    titleMaxLength: 60,
    /** Durée proposée par défaut à l'ouverture du formulaire (proposition). */
    defaultDurationMin: 60
  },

  notifications: {
    /** Heure du résumé envoyé la veille de chaque journée (modifiable dans les réglages). */
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
    generateTimeoutMs: 25000,
    /**
     * Fonction places : ses sources ont leur propre délai côté serveur
     * (Wikidata 15 s, Overpass 8 s) ; l'application attend donc plus que
     * 10 s pour ne pas abandonner avant la réponse (proposition).
     */
    placesTimeoutMs: 20000
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

  /**
   * Durées de cache côté serveur, par source, en secondes. config (5 min) et
   * geocode (30 jours) sont fixées par le cahier des charges ; les autres
   * sont des propositions.
   */
  cacheTtlSec: {
    config: 300,
    geocode: 2592000,
    weather: 3600,
    heritage: 2592000,
    osm: 604800,
    /** Wikidata : 7 jours (cahier des charges). */
    wikidata: 604800,
    /** Jours fériés : 30 jours (cahier des charges). */
    holidays: 2592000,
    terroir: 2592000,
    /** Découpage administratif (départements, communes). */
    admin: 2592000,
    fuel: 3600
  }
});
