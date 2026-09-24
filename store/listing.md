# Fiche Play Store — Mon guide

Limites Google Play : titre 30 caractères, description courte 80, description
longue 4 000. Les longueurs ci-dessous sont vérifiées par
`node store/check-listing.mjs`.

## Français (fr-FR)

### Titre

<!-- title:fr -->
Mon guide – Voyage sur-mesure
<!-- /title:fr -->

### Description courte

<!-- short:fr -->
Votre séjour en France et en Europe, planifié jour par jour, même hors ligne.
<!-- /short:fr -->

### Description longue

<!-- long:fr -->
Mon guide prépare votre séjour en quelques questions : destination, dates, mode de déplacement, hébergement et envies. Il vous propose un planning jour par jour, que vous pouvez modifier à tout moment.

UN PLANNING QUI VOUS RESSEMBLE
• Chaque journée : une visite culturelle, une pause gourmande, une sortie en plein air et un moment de détente.
• Trois profils : patrimoine certifié, équilibré, ou explorateur.
• Monuments historiques, musées, parcs, points de vue, marchés et producteurs locaux.
• Restaurants choisis près de vos visites, ouverts au bon moment, avec les options végétariennes et l'accès en fauteuil quand l'information existe.

QUI S'ADAPTE À LA JOURNÉE
• La météo est prise en compte : s'il pleut, une visite en intérieur est proposée.
• Ajoutez vos propres étapes (visite d'un proche, rendez-vous, repas chez des amis) : la journée se réorganise, et rien ne change sans votre accord.
• Validez ou passez une étape : en cas de retard, Mon guide propose un planning réajusté, que vous pouvez annuler.
• Horaires modifiables à la main, lieux remplaçables en un geste.

PENDANT LE VOYAGE
• Le soir, le programme du lendemain avec l'heure de départ conseillée ; une heure avant chaque étape, un rappel.
• Carte des étapes et itinéraire vers chaque lieu.
• Planning consultable hors ligne, même en mode avion.
• Export PDF à imprimer ou partager.

RESPONSABLE ET TRANSPARENT
• Temps de trajet estimés et bilan carbone de vos déplacements, avec la comparaison entre marche, vélo, transports en commun et voiture.
• Données publiques et ouvertes : OpenStreetMap, Wikidata, ministère de la Culture, Open-Meteo, et d'autres sources citées dans l'application.

VOS DONNÉES
• Sans compte, vos séjours restent sur votre téléphone.
• Avec un compte (connexion par code reçu par e-mail, sans mot de passe), retrouvez vos séjours sur tous vos appareils.
• Aucune publicité, aucun suivi. Données hébergées dans l'Union européenne. Suppression du compte à tout moment.

32 pays pris en charge : les 27 pays de l'Union européenne, le Royaume-Uni, la Suisse, la Norvège, l'Islande et le Liechtenstein.

Les temps de trajet et les informations des lieux sont indicatifs : vérifiez-les avant de vous déplacer.
<!-- /long:fr -->

### Notes de version (1.0.0)

<!-- notes:fr -->
Première version : planning jour par jour, météo, étapes personnelles, rappels, carte, export PDF, synchronisation entre appareils.
<!-- /notes:fr -->

## English (en-GB)

### Title

<!-- title:en -->
Mon guide – Tailored trips
<!-- /title:en -->

### Short description

<!-- short:en -->
Your trip in France and Europe, planned day by day, even offline.
<!-- /short:en -->

### Full description

<!-- long:en -->
Mon guide prepares your trip from a few questions: destination, dates, way of getting around, accommodation and interests. It suggests a day-by-day plan that you can change at any time.

A PLAN THAT SUITS YOU
• Each day: a cultural visit, a food break, an outdoor outing and some time to relax.
• Three profiles: certified heritage, balanced, or explorer.
• Historic monuments, museums, parks, viewpoints, markets and local producers.
• Restaurants chosen near your visits, open at the right time, with vegetarian options and wheelchair access when the information exists.

THAT ADAPTS TO YOUR DAY
• The weather is taken into account: if it rains, an indoor visit is suggested.
• Add your own stops (visiting family, an appointment, a meal with friends): the day reorganises itself, and nothing changes without your approval.
• Mark a stop as done or skip it: if you are running late, Mon guide suggests an adjusted plan, which you can undo.
• Change times by hand, replace places in one tap.

DURING YOUR TRIP
• In the evening, the next day's programme with the suggested departure time; one hour before each stop, a reminder.
• Map of your stops and directions to each place.
• Plan available offline, even in airplane mode.
• PDF export to print or share.

RESPONSIBLE AND TRANSPARENT
• Estimated travel times and the carbon footprint of your journeys, comparing walking, cycling, public transport and car.
• Public and open data: OpenStreetMap, Wikidata, French Ministry of Culture, Open-Meteo, and other sources credited in the app.

YOUR DATA
• Without an account, your trips stay on your phone.
• With an account (sign-in with a code sent by email, no password), find your trips on all your devices.
• No advertising, no tracking. Data hosted in the European Union. Delete your account at any time.

32 countries supported: the 27 European Union countries, the United Kingdom, Switzerland, Norway, Iceland and Liechtenstein.

Travel times and place information are indicative: check them before you go.
<!-- /long:en -->

### Release notes (1.0.0)

<!-- notes:en -->
First release: day-by-day plan, weather, personal stops, reminders, map, PDF export, sync between devices.
<!-- /notes:en -->

## Visuels à produire

| Visuel | Format | Contenu proposé |
|---|---|---|
| Icône de l'application | 512 × 512 px, PNG 32 bits, sans transparence imposée par Google (coins arrondis appliqués par le Play Store) | pictogramme de l'application, identique à l'icône Android (`android/app/src/main/res/mipmap-*`) |
| Image de présentation (feature graphic) | 1024 × 500 px, JPEG ou PNG 24 bits, sans transparence | nom « Mon guide » et une journée type sur fond de carte |
| Captures d'écran téléphone | 2 à 8, PNG ou JPEG, côté court ≥ 320 px, côté long ≤ 3 840 px, ratio 16:9 ou 9:16 recommandé (ex. 1080 × 1920) | 1. formulaire de création ; 2. planning d'une journée ; 3. panneau « Planning réajusté » ; 4. carte des étapes ; 5. étape personnelle ; 6. bilan carbone ; 7. rappels (réglages) ; 8. export PDF |

Captures à faire en français et en anglais, sur un séjour réel (pas de données
inventées), sans adresse personnelle visible.
