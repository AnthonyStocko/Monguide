# Formulaire « Sécurité des données » (Play Console) — Mon guide 1.0.0

Réponses à reporter dans Play Console > Règles et programmes > Sécurité des
données. Établies d'après le code au 24 septembre 2026 ; à revoir à chaque
évolution qui touche aux données.

## Vue d'ensemble

| Question | Réponse |
|---|---|
| L'application collecte-t-elle ou partage-t-elle des types de données utilisateur obligatoires ? | **Oui** |
| Toutes les données sont-elles chiffrées en transit ? | **Oui** (HTTPS uniquement : Supabase, fonctions, tuiles de carte) |
| Les utilisateurs peuvent-ils demander la suppression de leurs données ? | **Oui** : dans l'application (Réglages > Supprimer mon compte) et sur le web : https://anthonystocko.github.io/Monguide/fr/suppression-compte.html |
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
| Adresse e-mail (Informations personnelles > Adresse e-mail) | Oui, avec un compte | Non | Non | Facultative (compte facultatif) | Gestion du compte | Oui | Oui (suppression du compte) | Envoi du code de connexion, identification du compte pour la synchronisation |
| Position précise (Position > Position exacte) | Oui, seulement au toucher de « Utiliser ma position » | **Oui** : transmise à Photon (komoot) pour trouver l'adresse | Oui : la position n'est pas conservée (seule l'adresse choisie l'est, si elle devient un hébergement) | Facultative | Fonctionnalités de l'application | Oui | Sans objet (non conservée) ; l'adresse enregistrée l'est avec le séjour | Proposer l'adresse d'un hébergement ou d'une étape à partir de la position |
| Position approximative (Position > Position approximative) | Oui : lieux recherchés, destination, hébergements envoyés au serveur | **Oui** : coordonnées transmises aux services de données (Open-Meteo, OpenStreetMap/Overpass, Wikidata, données publiques françaises) | Oui (caches et journaux : position arrondie à environ 1 km) | Obligatoire pour préparer un séjour | Fonctionnalités de l'application | Oui | Sans objet (non liée au compte) | Météo, lieux à visiter et restaurants autour de la destination |
| Adresses saisies (Informations personnelles > Adresse) : hébergements, lieux des étapes personnelles | Oui : recherche d'adresse (Photon) ; conservées avec le séjour si compte | **Oui** : texte recherché transmis à Photon | Recherche : oui ; séjour : non (conservé tant que le compte existe) | Facultatives | Fonctionnalités de l'application | Oui | Oui (suppression du séjour ou du compte) | Calcul des trajets et de l'heure de départ ; retrouver ses séjours sur ses appareils |
| Contenu des séjours (Activité dans l'application > Autre contenu généré par l'utilisateur) : titres, dates, planning, notes, étapes personnelles | Oui, avec un compte | Non | Non | Facultatif | Fonctionnalités de l'application | Oui | Oui (suppression du séjour ou du compte) | Synchronisation entre appareils |
| Identifiants d'appareil ou autres | Non | Non | — | — | — | — | — | Aucun identifiant d'appareil ni publicitaire. L'adresse IP n'est conservée que sous forme d'empreinte salée pendant un jour (limitation des abus) |
| Journaux de plantage, diagnostics | Non | Non | — | — | — | — | — | Aucun outil de rapport de plantage |
| Contacts, photos, fichiers, santé, finances, messages, audio | Non | Non | — | — | — | — | — | — |

## Décisions

- **Position et adresses : déclarées « partagées »** (décision du 24 septembre
  2026) : la position précise (« Utiliser ma position ») et le texte des
  adresses recherchées sont transmis à Photon (komoot) ; la position n'est
  pas arrondie avant la recherche inverse, pour garder une adresse précise.
- **Tuiles de carte** : chargées directement depuis tile.openstreetmap.org
  (l'adresse IP est visible par la fondation OpenStreetMap). Pas de donnée
  utilisateur transmise au sens du formulaire, mais mentionné dans la
  politique de confidentialité.
