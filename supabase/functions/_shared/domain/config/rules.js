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
 * charges et restent à valider. Horaires des repas : config/mealTimes.js
 * (valeurs par défaut ici, valeurs de chaque pays là-bas).
 */
import { DEFAULT_MEAL_TIMES } from './mealTimes.js';

export const RULES = Object.freeze({
  /**
   * Gabarit de journée : horaires de la génération initiale, puis retour à
   * l'hébergement. departure sert aussi de départ conseillé quand une journée
   * commence par un temps libre. lunch, relax et dinner : heures par défaut,
   * propres à chaque pays dans config/mealTimes.js (mealTimesFor).
   */
  dayTemplate: {
    departure: '09:00',
    culture: '10:00',
    lunch: DEFAULT_MEAL_TIMES.lunch.start,
    outdoor: '14:30',
    relax: DEFAULT_MEAL_TIMES.visits.relax,
    dinner: DEFAULT_MEAL_TIMES.dinner.start
  },

  /** Plage horaire dans laquelle le déjeuner doit commencer (par pays : config/mealTimes.js). */
  lunchWindow: { ...DEFAULT_MEAL_TIMES.lunch.window },

  /**
   * Durées par type d'activité, en minutes : conseillée (durée par défaut
   * d'une étape) et minimale (en dessous, l'étape n'a plus de sens). Durée
   * d'un lieu : scoring/duration.js (notoriété, durées connues de
   * config/durations.json, rythme du séjour : durationRules).
   */
  durations: {
    museum: { recommendedMin: 90, minimumMin: 60 },
    /** grand musée : notoriété d'au moins durationRules.bigMuseumScore */
    bigMuseum: { recommendedMin: 150, minimumMin: 90 },
    castle: { recommendedMin: 120, minimumMin: 75 },
    monument: { recommendedMin: 45, minimumMin: 20 },
    /** église, cathédrale, chapelle */
    church: { recommendedMin: 30, minimumMin: 15 },
    /** place, quartier */
    square: { recommendedMin: 40, minimumMin: 20 },
    /** petit patrimoine, point de vue */
    smallHeritage: { recommendedMin: 30, minimumMin: 15 },
    /** parc, espace naturel */
    park: { recommendedMin: 60, minimumMin: 30 },
    /** sentier, randonnée */
    trail: { recommendedMin: 120, minimumMin: 90 },
    /** marché, producteur */
    market: { recommendedMin: 45, minimumMin: 30 },
    /** déjeuner : durée conseillée par pays dans config/mealTimes.js */
    restaurant: { recommendedMin: DEFAULT_MEAL_TIMES.lunch.durationMin, minimumMin: 60 },
    /** dîner (restaurant ou soirée libre), quel que soit le lieu */
    dinner: { recommendedMin: 90, minimumMin: 60 },
    /** détente, temps libre */
    relax: { recommendedMin: 60, minimumMin: 30 },
    /** « coup d'œil » : lieu vu en passant (statue, fontaine, façade), inséré sur un trajet */
    glance: { recommendedMin: 10, minimumMin: 5 }
  },

  /**
   * Modulation des durées (scoring/duration.js) : grand musée au-delà de
   * bigMuseumScore de notoriété ; monument ou église très connus (au moins
   * famousScore) : famousBonusMin de plus ; durée maximale = conseillée ×
   * maxFactor (compaction des journées) ; coefficient du rythme du séjour
   * (Trip.pace), jamais appliqué aux coups d'œil ni aux repas.
   */
  durationRules: {
    bigMuseumScore: 75,
    famousScore: 80,
    famousBonusMin: 15,
    maxFactor: 1.5,
    pace: { relaxed: 1.25, balanced: 1, intense: 0.85 }
  },

  /**
   * Journées (generateTrip.js, compactDay.js) : visites en extérieur finies
   * au plus tard outdoorBeforeSunsetMin avant le coucher du soleil ;
   * compaction jusqu'à ce qu'aucun écart sans étape ne dépasse maxGapMin
   * (hors temps libre volontaire) ; au plus maxFillers visites ajoutées par
   * jour ; temps libre volontaire (rythme tranquille ou demandé dans « Vos
   * envies ») de freeTimeMin en fin d'après-midi ; aucune visite ajoutée ou
   * allongée ne finit après lastVisitEnd.
   */
  day: {
    outdoorBeforeSunsetMin: 30,
    lastVisitEnd: '20:00',
    /** Trou qui reste après la compaction au-delà de cette durée : « Temps libre » visible (aucun lieu possible). */
    unfilledGapMin: 45,
    maxGapMin: 20,
    maxFillers: 6,
    freeTimeMin: 60
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
     * + bonus certifié + bonus de diversité des catégories + notoriété
     * (place.notoriety rapportée à 100, scoring/notoriety.js).
     */
    score: {
      proximity: 45,
      certified: 15,
      diversity: 10,
      notoriety: 30,
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

  /**
   * Seuils horaires, propres à chaque type d'étape : dinner pour le dîner,
   * activity pour toutes les autres (visites, déjeuner, étapes personnelles).
   */
  schedule: {
    /** Une étape doit commencer au plus tard à cette heure. */
    latestStart: { activity: '19:00', dinner: '21:30' },
    /** Une étape qui finit après cette heure est signalée (avertissement LATE). */
    lateEnd: { activity: '21:00', dinner: '23:00' }
  },

  places: {
    /** Deux lieux à moins de cette distance (m) sont considérés comme un seul. */
    dedupDistanceM: 50,
    /** Taille maximale de la réserve de lieux non utilisés d'un séjour (Trip.candidates). */
    maxCandidates: 100,
    /**
     * Lieux gardés au moins dans la réserve pour chaque type proposé
     * (config/activityTypes.js), s'il en existe : aucune liste vide hors ligne.
     */
    minPerType: 8,
    /** Fonction places, bouton « Plus de résultats » : lieux par page. */
    pageSize: 20,
    /** Restaurants ouverts le soir gardés au moins dans la réserve, pour remplacer un dîner sans réseau. */
    minDinnerCandidates: 10,
    /** Rayon de recherche maximal accepté par la fonction places, en km. */
    maxRadiusKm: 50,
    /** Valeurs OSM "cuisine" qui rendent un restaurant "régional". */
    regionalCuisines: ['regional', 'french']
  },

  /**
   * Notoriété des lieux (scoring/notoriety.js), lieux à écarter
   * (scoring/exclusions.js), incontournables et « coups d'œil »
   * (mustSee.js). Classes Wikidata : config/placeClasses.js. Propositions,
   * calibrées sur les séjours de référence (scripts/quality).
   */
  notoriety: {
    /**
     * Score 0-100. Signal principal : articles Wikipédia (sitelinks), en
     * échelle logarithmique, plein à sitelinksFull articles. Signaux
     * secondaires : article dans la langue de l'interface ou du pays, tags
     * OSM tourism=attraction|museum, heritage=* avec wikidata, désignation
     * de premier rang (patrimoine mondial, monument classé…).
     */
    sitelinksFull: 60,
    weights: {
      sitelinks: 70,
      langArticle: 5,
      localArticle: 5,
      osmAttraction: 8,
      osmHeritage: 4,
      worldHeritage: 15,
      topDesignation: 8,
      tentativeHeritage: 5
    },
    /**
     * Seuil adaptatif des visites (musées, monuments) : percentile de la
     * distribution locale des scores, jamais sous minScore ; abaissé quand il
     * reste moins de minVisitsPerDay × jours lieux au-dessus (petite ville).
     */
    threshold: { percentile: 75, minScore: 15, minVisitsPerDay: 8 },
    /** Lieu connu : accepté par le profil « équilibré » même sans label officiel. */
    notableScore: 40,
    /** Lieux à écarter : nature générique ou libellé générique sous minSitelinks articles ; non visitable sous glanceScore. */
    exclusion: { minSitelinks: 3, glanceScore: 45 },
    /**
     * Incontournables : perDay par jour (entre min et max) lieux de score au
     * moins minScore, à moins de radiusKm du logement (rayon effectif du mode
     * s'il est plus petit), placés en priorité ; maxVisitsPerDay visites et
     * maxGlancesPerDay coups d'œil par jour au plus ; une étape insérée ne
     * retarde jamais une étape du gabarit de plus de delayToleranceMin.
     */
    mustSee: { min: 5, max: 10, perDay: 3, minScore: 40, radiusKm: 5, maxVisitsPerDay: 3, maxGlancesPerDay: 3, delayToleranceMin: 15 },
    /** Autres coups d'œil insérés sur les trajets : au plus maxPerDay par jour, détour d'au plus maxDetourMin. */
    glance: { maxPerDay: 2, maxDetourMin: 10 },
    /** Requête Wikidata des lieux connus (toutes natures) : au moins minSitelinks articles, les limit plus connus. */
    notableQuery: { minSitelinks: 5, limit: 150 }
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
    /** France : identifiants Wikidata des lieux Mérimée et Muséofile (délai court, sans bloquer places). */
    linkTimeoutSec: 6,
    /** Références par requête (POST). */
    linkBatch: 1000,
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

  /**
   * Types de lieux proposés (config/activityTypes.js) : type d'étape selon
   * l'heure choisie (propositions).
   */
  activityTypes: {
    /** Restaurant : déjeuner avant cette heure, dîner à partir de cette heure. */
    dinnerFrom: '17:00',
    /** Marché et producteur : déjeuner avant cette heure, visite (culture) ensuite. */
    marketLunchUntil: '15:00'
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
    reminderLeadMin: 60,
    /** Heure du rappel de réservation, la veille d'un dîner de groupe un jour chargé (booking.js). */
    bookingReminderTime: '10:00'
  },

  /**
   * Groupes (booking.js) : « Pensez à réserver » sur chaque restaurant à
   * partir de bookAheadFrom voyageurs ; dîners mis en avant, avec un rappel
   * la veille, les jours busyDinnerDays (0 = dimanche … 6 = samedi).
   */
  groups: {
    bookAheadFrom: 5,
    busyDinnerDays: [5, 6]
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
    /** Génération : collecte (16 s au plus), planning, puis relecture par l'IA (8 s au plus). */
    generateTimeoutMs: 35000,
    /**
     * Fonction places : ses sources ont leur propre délai côté serveur
     * (Wikidata 15 s, Overpass 8 s) ; l'application attend donc plus que
     * 10 s pour ne pas abandonner avant la réponse (proposition).
     */
    placesTimeoutMs: 20000
  },

  /**
   * Relecture du planning par une IA (côté serveur, _shared/ai). Surchargeable
   * dans app_config clé par clé ("ai.enabled") ou d'un bloc (clé "ai", valeur
   * { enabled, provider, model, ... }). provider : "mistral", "groq",
   * "openrouter", "gemini" ou "off" ; model vide = modèle par défaut du
   * fournisseur. Clé d'API : secret Supabase AI_API_KEY_<FOURNISSEUR>
   * (docs/ai-review.md). Limites de coût : propositions.
   *
   * Désactivée par défaut tant que les seuils d'activation (Bloc G :
   * évaluation scripts/ai-eval) ne sont pas atteints ; ensuite, activée pour
   * rolloutPercent % des installations (tirage stable, aiRollout.js).
   */
  ai: {
    enabled: false,
    /** Part des installations à qui la relecture est proposée (0 à 100). */
    rolloutPercent: 10,
    provider: 'mistral',
    model: '',
    /** Délai maximal d'une relecture ; au-delà, planning livré sans relecture. */
    timeoutMs: 8000,
    /** Opérations proposées par l'IA retenues au plus par séjour. */
    maxOpsPerTrip: 6,
    /** Relectures par jour (UTC) et par client (utilisateur, sinon empreinte d'IP). */
    userDailyLimit: 5,
    /** Relectures par jour (UTC), tous clients confondus. */
    globalDailyLimit: 500,
    /** Candidats envoyés au plus (les plus pertinents, types variés). */
    maxCandidates: 80,
    /** Longueur maximale du texte « Vos envies » (formulaire, contrôle serveur, envoi). */
    wishesMaxLength: 200
  },

  /** Appels du serveur vers les API externes (module _shared/http.js). */
  images: {
    /** Identifiants Wikidata par appel de la fonction images. */
    maxIds: 30,
    /** Largeurs d'affichage acceptées (Commons sert une largeur standard au moins égale). */
    widths: [400, 800],
    /** Recherche de la ville de destination : distance maximale du résultat Wikidata. */
    cityMaxDistanceKm: 15,
    /** Délai de chaque appel à Wikidata ou Commons (un seul essai en plus du premier). */
    timeoutMs: 8000
  },

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
    otherPerWindow: 600,
    /** trip-apply-ops : appels par minute et par utilisateur (fenêtre d'une minute). */
    tripOpsPerMinute: 120,
    /** Invitations (trip-invite-link, trip-invite-email, trip-join, trip-invites-claim) : appels par fenêtre. */
    invitesPerWindow: 60
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
    fuel: 3600,
    /** Photos Wikimedia Commons, y compris les "pas d'image" : 30 jours. */
    images: 2592000
  },

  /**
   * Adresses publiques et contact, SEUL endroit où elles sont écrites (avec
   * les pages statiques de public/ et docs/liens-publics.md). Surcharge sans
   * nouvelle version : app_config, clé "public.contactEmail" par exemple.
   */
  public: {
    webApp: 'https://monguide.mgapp.workers.dev',
    playStore: 'https://play.google.com/store/apps/details?id=com.monguide.app',
    presentation: 'https://monguide.mgapp.workers.dev/decouvrir.html',
    privacy: 'https://monguide.mgapp.workers.dev/confidentialite.html',
    legal: 'https://monguide.mgapp.workers.dev/mentions-legales.html',
    accountDeletion: 'https://monguide.mgapp.workers.dev/suppression-compte.html',
    contactEmail: 'monguide.app@outlook.com'
  }
});
