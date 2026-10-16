# Formulaire « Sécurité des données » (Play Console) — Mon guide 1.2.0

Réponses à reporter dans Play Console > Règles et programmes > Sécurité des
données. Établies d'après le code au 24 septembre 2026, mises à jour le
30 septembre 2026 (relecture par l'assistant IA), le 13 octobre 2026
(rappels de la version web) et le 16 octobre 2026 (séjours partagés) ; à revoir à chaque évolution qui touche aux
données.

## Vue d'ensemble

| Question | Réponse |
|---|---|
| L'application collecte-t-elle ou partage-t-elle des types de données utilisateur obligatoires ? | **Oui** |
| Toutes les données sont-elles chiffrées en transit ? | **Oui** (HTTPS uniquement : Supabase, fonctions, tuiles de carte) |
| Les utilisateurs peuvent-ils demander la suppression de leurs données ? | **Oui** : dans l'application (Réglages > Supprimer mon compte) et sur le web : https://monguide.mgapp.workers.dev/suppression-compte.html |
| Publicité | **Aucune** (ni SDK publicitaire, ni identifiant publicitaire) |
| Suivi, mesure d'audience, profilage | **Aucun** (ni Firebase, ni Analytics, ni SDK tiers de suivi) |
| Revue de sécurité indépendante | Non |

Sans compte, les séjours restent sur le téléphone ; le compte est facultatif.

## Détail par type de donnée

« Collectée » = transmise hors de l'appareil. « Partagée » = transmise à un
tiers (définition Google Play : un prestataire agissant pour notre compte
n'est pas un partage ; Photon, Open-Meteo, etc. sont des services publics
sans contrat, d'où la déclaration prudente « partagée » pour la position).

| Donnée (catégorie Play) | Collectée | Partagée | Traitement éphémère | Obligatoire ou facultative | Finalités | Chiffrée en transit | Supprimable | Pourquoi |
|---|---|---|---|---|---|---|---|---|
| Adresse e-mail (Informations personnelles > Adresse e-mail) | Oui, avec un compte | Non | Non | Facultative (compte facultatif) | Gestion du compte | Oui | Oui (suppression du compte) | Envoi du code de connexion, identification du compte pour la synchronisation. **Depuis 1.2.0** : aussi l'adresse d'une personne invitée à un séjour, saisie par l'organisateur (`trip_invites`) ; aucun e-mail envoyé ; effacée dès l'invitation acceptée, désactivée ou expirée, 30 jours au plus (purge horaire, migration `20261016200000_invite_purge.sql`) |
| ID utilisateur (Informations personnelles > ID utilisateur) : identifiant du compte Supabase | Oui, avec un compte | Non | Non | Facultatif (compte facultatif) | Gestion du compte | Oui | Oui (suppression du compte, effacement en cascade des séjours) | Rattacher les séjours synchronisés au compte (`trips.user_id`, `trip_members`) |
| **Nom** (Informations personnelles > Nom) : prénom affiché, depuis 1.2.0 | Oui, seulement au premier partage d'un séjour | **Non** : montré aux seuls participants que l'utilisateur a choisis, à son initiative (voir Décisions) | Non | Facultatif (le partage est facultatif) | Fonctionnalités de l'application | Oui | Oui (modifiable ; effacé à la suppression du compte) | Montrer aux participants d'un séjour partagé qui a fait quelle modification (`profiles.display_name`, avec une couleur de pastille) |
| Position précise (Position > Position exacte) | Oui, seulement au toucher de « Utiliser ma position » | **Oui** : transmise à Photon (komoot) pour trouver l'adresse | Oui : la position n'est pas conservée (seule l'adresse choisie l'est, si elle devient un hébergement) | Facultative | Fonctionnalités de l'application | Oui | Sans objet (non conservée) ; l'adresse enregistrée l'est avec le séjour | Proposer l'adresse d'un hébergement ou d'une étape à partir de la position |
| Position approximative (Position > Position approximative) | Oui : lieux recherchés, destination, hébergements envoyés au serveur | **Oui** : coordonnées transmises aux services de données (Open-Meteo, OpenStreetMap/Overpass, Wikidata, données publiques françaises) | **Non** : la destination est conservée avec le séjour si compte (`trips.destination`), et dans les caches du serveur (journaux : position arrondie à environ 1 km) | Obligatoire pour préparer un séjour | Fonctionnalités de l'application | Oui | Oui (suppression du séjour ou du compte) ; caches non liés au compte | Météo, lieux à visiter et restaurants autour de la destination |
| Adresses saisies (Informations personnelles > Adresse) : hébergements, lieux des étapes personnelles | Oui : recherche d'adresse (Photon) ; conservées avec le séjour si compte | **Oui** : texte recherché transmis à Photon | Recherche : oui ; séjour : non (conservé tant que le compte existe) | Facultatives | Fonctionnalités de l'application | Oui | Oui (suppression du séjour ou du compte) | Calcul des trajets et de l'heure de départ ; retrouver ses séjours sur ses appareils |
| Contenu des séjours (Activité dans l'application > Autre contenu généré par l'utilisateur) : titres, dates, planning, notes, étapes personnelles | Oui, avec un compte | Non | Non | Facultatif | Fonctionnalités de l'application | Oui | Oui (suppression du séjour ou du compte) | Synchronisation entre appareils ; **depuis 1.2.0**, séjour partagé : contenu, liste des participants et historique des modifications (200 dernières, avec leur auteur) visibles des participants choisis par l'utilisateur |
| Relecture par l'assistant IA (Activité dans l'application > Autre contenu généré par l'utilisateur ; Messages > Autres messages dans l'application pour le texte « Vos envies ») : destination, dates, voyageurs, mode, profil, préférences de repas, lieux publics du planning et leurs horaires, distances, pluie, texte « Vos envies » | Oui, seulement si l'utilisateur active la relecture | **Non** : Mistral AI agit comme prestataire pour notre compte (à confirmer par l'accord de traitement des données du fournisseur) | **Non** : le texte « Vos envies » est enregistré avec le séjour (`trip.params.wishes`, synchronisé si compte) ; le résumé envoyé à l'IA et sa réponse ne sont pas conservés (compteur quotidien sans contenu) | Facultative (consentement à la première génération, réglage « Relecture par l'assistant IA ») | Fonctionnalités de l'application (personnalisation du planning) | Oui | Oui (« Vos envies » : suppression du séjour ou du compte) ; résumé et réponse non conservés | Proposer des ajustements du planning, vérifiés par l'application ; jamais d'adresse, de coordonnées, d'e-mail, ni de titre ou note d'étape personnelle |
| Identifiants d'appareil ou autres | Non | Non | — | — | — | — | — | Aucun identifiant d'appareil ni publicitaire. L'adresse IP n'est conservée que sous forme d'empreinte salée pendant un jour (limitation des abus) |
| Journaux de plantage, diagnostics | Non | Non | — | — | — | — | — | Aucun outil de rapport de plantage |
| Contacts, photos, fichiers, santé, finances, messages, audio | Non | Non | — | — | — | — | — | — |

## Version web : abonnements aux notifications

Le formulaire « Sécurité des données » décrit l'application Android
distribuée par Google Play. Les abonnements aux notifications web (Web Push)
ne la concernent pas : sur Android, les rappels sont des notifications
locales, programmées sur le téléphone, et rien n'est transmis. **Aucune
réponse du formulaire ne change.**

La version web (iPhone, Mac, PC), elle, collecte si l'utilisateur active les
rappels : l'abonnement du navigateur (adresse technique du service de push
et clés de chiffrement), un identifiant aléatoire de l'appareil, la langue,
le lien avec le compte s'il est connecté, et les rappels à envoyer (heure,
texte sans adresse ni titre d'étape personnelle, lien vers le planning).
Conservation : rappels 7 jours après l'envoi, abonnement 90 jours sans
utilisation ou jusqu'au retrait de l'autorisation. C'est décrit dans la
politique de confidentialité (section « Rappels de la version web »),
commune aux deux versions et référencée par la fiche Play.

À revoir si l'application Android adopte un jour des notifications envoyées
par le serveur : il faudrait alors déclarer « Identifiants d'appareil ou
autres » (collectés, non partagés, fonctionnalités de l'application).

## Décisions

- **Séjours partagés : « collectés », pas « partagés »** (16 octobre 2026,
  Prompt 8.0). Le prénom affiché et le contenu d'un séjour partagé sont
  transmis aux autres participants. C'est l'utilisateur qui les choisit : il
  envoie un lien ou saisit une adresse. D'après la définition de Google Play,
  une transmission à un tiers faite à l'initiative de l'utilisateur, qu'il
  s'attend raisonnablement à voir partagée, n'est pas un « partage ».
  Les nouveautés de 1.2.0 dans le formulaire :
  - ajouter le type **Nom** ;
  - garder « Adresse e-mail » (son usage s'étend aux invitations) ;
  - garder « Autre contenu généré par l'utilisateur ».
  La politique de confidentialité le décrit dans la section « Séjours
  partagés ». Elle doit être en ligne **avant** l'envoi de la 1.2.0 :
  https://monguide.mgapp.workers.dev/confidentialite.html (adresse à déclarer sur Google
  Play, `docs/liens-publics.md`).

- **Position et adresses : déclarées « partagées »** (décision du 24 septembre
  2026) : la position précise (« Utiliser ma position ») et le texte des
  adresses recherchées sont transmis à Photon (komoot) ; la position n'est
  pas arrondie avant la recherche inverse, pour garder une adresse précise.
- **Relecture par l'assistant IA** (30 septembre 2026, Prompt 6.0) :
  fournisseur Mistral AI (`ai.provider` = `mistral` dans app_config).
  Déclarée « collectée » mais « non partagée » en tant que prestataire.
  À VÉRIFIER avant publication : accord de traitement des données (DPA) de
  Mistral AI et durée de conservation par le fournisseur ; si l'offre
  utilisée permet l'entraînement des modèles sur les données reçues, la
  déclarer « partagée » et le mentionner dans la politique de
  confidentialité. À revoir si `ai.provider` change (Groq, OpenRouter,
  Gemini : autres pays, autres conditions).
- **Tuiles de carte** : chargées directement depuis tile.openstreetmap.org
  (l'adresse IP est visible par la fondation OpenStreetMap). Pas de donnée
  utilisateur transmise au sens du formulaire, mais mentionné dans la
  politique de confidentialité.
