# Design system « Carnet de voyage »

Référence visuelle de l'application (Prompt 4.0). Source de vérité : le bloc
`@theme` de `src/index.css`. Vitrine de tous les composants et de leurs états :
page **/debug/theme** (lien depuis Diagnostic), entièrement embarquée (s'affiche
en mode avion).

## Jetons

- **Polices** : Fraunces 600 pour les titres (`h1` à `h4`, `font-display`),
  Inter Variable pour le texte. Paquets `@fontsource/fraunces` (graisse 600
  seule, jamais simulée : `font-synthesis: none`) et
  `@fontsource-variable/inter`, embarqués dans le build.
- **Tailles** : 16 px minimum (`text-xs` et `text-sm` ramenés à 16 px). Seule
  exception : `text-credit` (13 px), réservé aux crédits photo et aux
  métadonnées secondaires.
- **Couleurs** : fond `canvas` #F7F3EC, cartes `surface` #FFFFFF, bordures
  décoratives `line` #E7E0D4, bordures de champs `line-strong` #857B6D, texte
  `ink` #0F172A et `ink-muted` #57534E ; action `primary` #059669 (texte et
  fond de bouton : `primary-strong` #047857), secondaire `secondary` #0284C7
  (texte : `secondary-strong` #0369A1), accents `accent-gold` #D9A441 et
  `accent-rust` #B45309.
- **Non textuelles uniquement** : `primary`, `secondary`, `accent-gold`, `line`.
- **Rayons** : `rounded-lg` 12 px et `rounded-xl` 14 px (boutons, champs),
  `rounded-2xl` 20 px (cartes), `rounded-3xl` 26 px (feuilles, illustrations).
- **Ombres** : `shadow-sm`, `shadow-md`, `shadow-xl`, teintées brun.

## Animations

Système commun `src/ui/motion.js` (bibliothèque `motion`, import
`motion/react`, chargée en `LazyMotion` avec `domAnimation` : composants
`m.*` uniquement) :

- Durées : rapide 150 ms, standard 250 ms, emphase 450 ms ; courbes
  `EASE.standard`, `enter`, `exit` ; `SPRING` (léger rebond).
- Variantes : `appear` (fondu et montée, cascade), `slide` (glissement
  horizontal selon le sens), `pop` (apparition avec rebond).
- `useMotionAllowed()` : faux si le téléphone (prefers-reduced-motion,
  « Supprimer les animations » d'Android) ou le réglage « Réduire les
  animations » de l'application le demande ; tout apparaît alors
  directement à sa place finale.
- `useFirstShow(clé)` + `cascadeProps` : cascade de 50 ms au premier
  affichage seulement (clé gardée pour la session : revenir sur un onglet ne
  rejoue rien), 20 éléments animés au plus.

Mises en place : transition d'onglet (fondu et glissement de 16 px, 200 ms,
`AppLayout`), glissement entre les étapes du formulaire et barre qui se
remplit, cascades (étapes du jour, favoris, candidats d'un remplacement),
coche de validation en pop qui se dessine (`src/ui/ValidatedCheck.jsx`) puis
message « Annuler », panneaux qui s'ouvrent avec un rebond et se ferment en
glissant vers le bas (`src/ui/useSheetMotion.js`, Dialog et BottomSheet),
marqueurs de la carte qui tombent (CSS `map-marker-drop`) et tracé du jour
qui se dessine (`stroke-dashoffset`, API Web Animations, un seul chemin),
reflet des squelettes, fondu des photos au premier chargement.

Règles : transform et opacity uniquement (plus le tracé de la carte),
jamais width, height, top ni left ; will-change laissé à motion ; en CSS,
toujours derrière `motion-ok:` ou les règles `:root:not([data-reduce-motion])`,
plus un filet de sécurité global. Boucles réservées au reflet de chargement
et aux illustrations.

Vibrations (`src/services/haptics.js`, `@capacitor/haptics`) : valider une
étape (impact léger), confirmer une action importante (séjour créé ou
supprimé), signaler une erreur (échec de génération). Réglage « Vibrations »
(activé par défaut) ; avec les animations réduites, seule la vibration
d'erreur reste.

## Photos

Photos Wikimedia Commons fournies par la fonction `images` (`docs/api.md`),
demandées après la génération (`src/services/tripImages.js`) : lieux des
étapes en 400 px, destination (`trip.hero`) en 800 px, candidats d'un
remplacement à l'affichage.

- `usePhoto` / `Photo` (`src/components/ui/Photo.jsx`) : photo ou, à défaut
  (absente, sans crédit, domaine autre que `https://upload.wikimedia.org/`,
  échec de chargement, hors ligne sans copie), illustration maison
  (`src/illustrations/`) : jamais d'image cassée ni
  de cadre vide, jamais de photo sans crédit (`isPlaceImage`, `model.js`).
- Crédit (`ImageCredit`) : « Photo : Auteur · Licence · Source », avec les
  liens vers la licence et la page Commons (48 px de haut). Sur les photos,
  derrière un bouton « i » discret (zone de 48 px, `aria-expanded`) ; dans
  les fiches de lieu, écrit en clair (`credit="inline"`).
- `ImageCard` : image en tête ou vignette, titre éventuellement posé sur
  l'image.
- Hors ligne (`src/services/offlineImages.js`) : à l'ouverture du planning,
  les photos du séjour sont enregistrées dans IndexedDB (5 Mo au plus par
  séjour, les plus petites d'abord), sauf hors Wi-Fi quand le réglage
  « Télécharger les images en Wi-Fi uniquement » (activé par défaut) est
  coché : un message l'explique alors sur le planning. La copie locale est
  affichée en priorité (`useImageSrc`) ; supprimer un séjour supprime ses
  photos (sauf celles d'un autre séjour).

Texte sur photo : utilitaire `image-scrim`, voile `ink` dont l'opacité vaut au
moins 0,72 sous le texte, soit au moins 7,1:1 pour du texte blanc, même sur une
photo entièrement blanche.

## Illustrations

Jeu maison en composants React SVG (`src/illustrations/`), vitrine sur
**/debug/illustrations** : dessin à plat, 3 à 5 couleurs de la palette
(`palette.js`), aucun texte, toutes décoratives (`aria-hidden`), vérifiées
par `illustrations.test.jsx`. Moins de 20 Ko pour l'ensemble (4 Ko gzip).

- Vignettes carrées par catégorie (`illustrationForCategory`) : restaurant,
  marché, producteur, parc, espace naturel, point de vue, petit patrimoine,
  monument, musée, étape personnelle, hébergement. Affichées entières sur
  leur fond dans tout cadre. Chaque étape du planning a une image : sa photo,
  sinon la vignette de sa catégorie, ou de son type pour un temps libre
  (`illustrationForStep`).
- Paysage de destination par défaut (`landscape`), états vides (`noTrips`,
  `offline`, `error`, `noResults`), écrans d'accueil (`onboardingPrepare`,
  `onboardingFollow`, `onboardingFree`).
- Animations (classes `ill-spin`, `ill-drift`, `ill-hop`, `index.css`) :
  soleil qui tourne très lentement (90 s par tour), nuage qui dérive, repère
  qui sautille. Seules boucles avec le reflet de chargement ; arrêtées par le
  réglage « Réduire les animations » (Réglages, `src/services/motion.js`,
  appliqué avant le premier affichage) ou par le téléphone.

## Écrans

D'après les maquettes du canevas « Mon guide — Refonte visuelle » (Accueil,
Préparation du séjour, Planning du jour), en gardant les règles de lecture
(16 px minimum, 13 px pour les seuls crédits, contrastes AA) là où les
maquettes descendent plus bas.

- Premier lancement (`src/components/onboarding/Onboarding.jsx`) : trois
  écrans illustrés, « Passer » à tout moment, jamais réaffichés
  (`services/onboarding.js`).
- Accueil : salutation, carte du prochain séjour (`NextTripCard` : photo ou
  paysage, compte à rebours, météo de la mi-journée du premier jour), bouton
  « Créer un nouveau séjour », séjours récents (`TripImageCard`).
- Création : illustration en tête de chaque étape, glissement entre les
  étapes, options en grandes cartes sélectionnables (`ChoiceGroup`).
- Préparation du séjour (`PreparationScreen`) : étapes cochées à la
  réception des événements réels de `generate` en flux (docs/api.md) ;
  sans flux, barre indéterminée sans étapes ; astuce, « Annuler ».
- Planning : bandeau photo (jour et date), onglets de jours, cartes d'étape
  (vignette, plage horaire, statut, nom, badges, crédit en clair), trajets
  « ≈ » entre les cartes, prochaine étape du jour bordée de vert.
- Carte : marqueurs illustrés par catégorie (anneau de la couleur du
  groupe, numéro), fiche du lieu en panneau (`PlaceSheet`) avec photo et
  crédit.
- Favoris : cartes à image avec le statut (en cours, à venir, terminé).
- États vides, hors ligne et erreurs : illustration, texte clair, action.

## Contrastes vérifiés

Liste tenue dans `src/components/debug/theme/contrastPairs.js`, calculée par
`contrastPairs.test.js` à partir d'`index.css` (le test échoue si un couple
passe sous le seuil) et affichée sur /debug/theme. Seuils WCAG AA : 4,5:1 pour
le texte (crédits de 13 px compris), 3:1 pour les éléments non textuels.

| Usage | Premier plan | Fond | Contraste | Seuil |
|---|---|---|---|---|
| Texte courant sur le fond sable | `ink` | `canvas` | 16,14:1 | 4,5:1 |
| Texte des cartes | `ink` | `surface` | 17,85:1 | 4,5:1 |
| Blocs discrets, onglets de jour non choisis | `ink` | `subtle` | 15,05:1 | 4,5:1 |
| Choix coché | `ink` | `primary-soft` | 15,74:1 | 4,5:1 |
| Texte secondaire sur le fond | `ink-muted` | `canvas` | 6,90:1 | 4,5:1 |
| Texte secondaire, crédits photo (13 px) | `ink-muted` | `surface` | 7,63:1 | 4,5:1 |
| Badge neutre | `ink-muted` | `subtle` | 6,43:1 | 4,5:1 |
| Bouton principal | `#ffffff` | `primary-strong` | 5,48:1 | 4,5:1 |
| Bouton principal survolé | `#ffffff` | `primary-hover` | 7,68:1 | 4,5:1 |
| Texte vert, onglet actif | `primary-strong` | `surface` | 5,48:1 | 4,5:1 |
| Texte vert sur le fond | `primary-strong` | `canvas` | 4,96:1 | 4,5:1 |
| Badge et puce primaires | `primary-on-soft` | `primary-soft` | 6,77:1 | 4,5:1 |
| Bouton secondaire, liens | `secondary-strong` | `surface` | 5,93:1 | 4,5:1 |
| Liens sur le fond | `secondary-strong` | `canvas` | 5,36:1 | 4,5:1 |
| Bouton secondaire survolé | `secondary-strong` | `secondary-soft` | 5,17:1 | 4,5:1 |
| Badge secondaire (météo) | `secondary-on-soft` | `secondary-soft` | 6,59:1 | 4,5:1 |
| Texte d’accent | `accent-rust` | `surface` | 5,02:1 | 4,5:1 |
| Badge certification | `accent-on-soft` | `accent-soft` | 5,78:1 | 4,5:1 |
| Badge et bandeau d’avertissement | `warning-on-soft` | `warning-soft` | 6,37:1 | 4,5:1 |
| Badge d’erreur | `danger-on-soft` | `danger-soft` | 6,80:1 | 4,5:1 |
| Erreur de champ | `danger-on-soft` | `surface` | 8,31:1 | 4,5:1 |
| Erreur de champ sur le fond | `danger-on-soft` | `canvas` | 7,51:1 | 4,5:1 |
| Toast | `#ffffff` | `ink` | 17,85:1 | 4,5:1 |
| Action du toast | `primary-soft` | `ink` | 15,74:1 | 4,5:1 |
| Texte blanc sur photo blanche, voile | `#ffffff` | `ink` + voile 0,72 sur #ffffff | 7,13:1 | 4,5:1 |
| Texte blanc sur photo jaune vif, voile | `#ffffff` | `ink` + voile 0,72 sur #ffe600 | 8,22:1 | 4,5:1 |
| Bordure des champs et interrupteurs | `line-strong` | `surface` | 4,16:1 | 3:1 |
| Bordure des champs sur le fond | `line-strong` | `canvas` | 3,76:1 | 3:1 |
| Icônes vertes | `primary` | `surface` | 3,77:1 | 3:1 |
| Icône sur pastille verte | `primary` | `primary-soft` | 3,32:1 | 3:1 |
| Icônes bleues | `secondary` | `surface` | 4,10:1 | 3:1 |
| Contour de focus | `focus` | `canvas` | 5,36:1 | 3:1 |
| Contour de focus | `focus` | `surface` | 5,93:1 | 3:1 |
| Contour de focus sur le toast | `focus` | `ink` | 3,01:1 | 3:1 |
