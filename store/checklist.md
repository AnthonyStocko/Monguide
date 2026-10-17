# Checklist de soumission Google Play — Mon guide

Les points marqués **À VÉRIFIER** dépendent de règles Google Play qui
évoluent : les confirmer dans la Play Console et le Centre d'aide au moment
de la soumission.

## 1. Avant de créer l'application

- [ ] Compte développeur Google Play créé, identité vérifiée.
- [ ] **Compte personnel créé récemment : test fermé obligatoire avant la
      production** — au moins 12 testeurs inscrits pendant au moins 14 jours
      consécutifs d'après les règles connues fin 2024 (**À VÉRIFIER** dans
      Play Console > Tableau de bord, conditions exactes affichées pour le compte).
- [ ] Identifiant définitif fixé : `com.monguide.app` (`capacitor.config.json`,
      `android/app/build.gradle`). Il ne pourra plus changer après la première
      publication.
- [x] Identité de l'éditeur et responsable du traitement (RGPD) : Anthony Mourier,
      indiqué dans la politique de confidentialité (pages web et application).
- [ ] Adresse de l'éditeur, si la Play Console la demande pour un compte
      personnel (**À VÉRIFIER** : affichage public de l'adresse selon le type de compte).
- [ ] Adresse de contact définitive (secret Supabase `MONGUIDE_CONTACT`, affichée
      dans l'application et sur les pages web).

## 2. Build de production

- [ ] Niveau d'API cible : `targetSdkVersion 36` (`android/variables.gradle`).
      Exigence Google Play au moment de la publication : **À VÉRIFIER**
      (nouvelles applications : API 35 exigée depuis le 31 août 2025 ; l'échéance
      suivante impose en général la version d'Android de l'année précédente).
- [ ] Tag `vX.Y.Z` poussé → workflow « Release Google Play » → artefacts
      `mon-guide-X.Y.Z-aab` (à téléverser) et `mon-guide-X.Y.Z-release-apk` (test).
- [ ] APK release (minifiée par R8) installée et testée sur téléphone : carte,
      génération, notifications (y compris après redémarrage et arrêt forcé),
      synchronisation, export PDF et partage.
- [ ] Keystore d'upload sauvegardé hors de GitHub (voir README).
- [ ] **Signature des applications par Google Play** activée à la création de
      l'application (recommandé) : la clé du dépôt n'est alors qu'une clé
      d'upload, réinitialisable en cas de perte.

## 3. Fiche et contenus (Play Console > Présence sur le Play Store)

- [ ] Textes : `store/listing.md` (français et anglais ; longueurs vérifiées par
      `node store/check-listing.mjs`).
- [ ] Visuels : icône 512 × 512, image de présentation 1024 × 500, captures
      d'écran (liste dans `store/listing.md`).
- [ ] Catégorie : Voyages et infos locales. Application gratuite, sans achat intégré.
- [ ] Coordonnées : e-mail de contact, site web https://monguide.mgapp.workers.dev/decouvrir.html

## 4. Contenu de l'application (Play Console > Règles et programmes > Contenu de l'application)

- [ ] **Règles de confidentialité** : https://monguide.mgapp.workers.dev/confidentialite.html
      (`docs/liens-publics.md` ; l'ancienne adresse GitHub Pages n'est plus en ligne).
- [ ] **Suppression de compte** (création de compte dans l'application) :
      URL https://monguide.mgapp.workers.dev/suppression-compte.html ;
      suppression aussi possible dans l'application (Réglages).
- [ ] **Accès à l'application** : toutes les fonctionnalités sont disponibles
      sans compte (mode invité) ; le compte ne sert qu'à la synchronisation.
      Indiquer « Toutes les fonctionnalités sont disponibles sans accès
      spécial ».
- [ ] **Annonces** : l'application ne contient pas d'annonces.
- [ ] **Classification du contenu** (questionnaire IARC) : catégorie
      « Référence, actualités ou éducation » ou « Utilitaire/Productivité »
      (**À VÉRIFIER** selon les catégories proposées) ; pas de violence, de
      contenu sexuel, de langage grossier, de substances, de jeux d'argent ;
      pas d'interaction entre utilisateurs ni de contenu partagé publiquement ;
      partage de la position : non (la position n'est pas partagée avec
      d'autres utilisateurs) ; achats numériques : non.
- [ ] **Public cible et contenu** : adultes (18 ans et plus). L'application ne
      s'adresse pas aux enfants : pas de programme « Familles ».
- [ ] **Sécurité des données** : réponses dans `store/data-safety.md`.
- [ ] **Applications gouvernementales, fonctionnalités financières, santé,
      actualités** : non concernée.

## 5. Permissions sensibles

| Permission | Justification à donner | Déclaration Play Console |
|---|---|---|
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | « Utiliser ma position » pour proposer l'adresse d'un hébergement ou d'une étape ; demandée au toucher, uniquement au premier plan | Pas de localisation en arrière-plan : aucun formulaire spécifique ; données déclarées dans « Sécurité des données » |
| `SCHEDULE_EXACT_ALARM` | Rappels d'étapes : une heure avant chaque étape du planning et résumé de la veille à l'heure choisie ; un rappel en retard ferait manquer l'étape (visite, rendez-vous, départ). Accordée par l'utilisateur dans les réglages Android ; sans elle, les rappels sont programmés quand même, avec un retard possible | **À VÉRIFIER** : déclaration éventuelle « Autorisation des alarmes exactes » dans Contenu de l'application. `USE_EXACT_ALARM` n'est jamais déclarée (réservée aux réveils et agendas ; vérifié par le workflow sur le manifeste fusionné) |
| `POST_NOTIFICATIONS` | Rappels et résumé de la veille ; demandée après un écran d'explication, au premier enregistrement d'un séjour | Aucune déclaration spécifique |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` | Réinscrire les rappels après un redémarrage du téléphone | Aucune déclaration spécifique |

## 6. Tests et publication

- [ ] **Test interne** : téléverser l'`.aab` sur la piste de test interne,
      installer depuis le Play Store sur au moins un téléphone, refaire la
      recette (section 2).
- [ ] **Test fermé** (obligatoire pour un compte personnel récent, voir 1) :
      liste de testeurs, durée minimale respectée, retours traités.
- [ ] Rapport de pré-lancement (Play Console) examiné : plantages,
      accessibilité, avertissements de sécurité.
- [ ] Demande d'accès à la production, puis déploiement progressif (par
      exemple 20 %, puis 100 %).
- [ ] Après publication : vérifier les pages web, la suppression de compte et
      la réception des e-mails de connexion (SMTP configuré, voir README).

## 7. Mise à jour 1.2.0 : séjours partagés (Prompt 8.0, Phase F)

À faire **dans cet ordre**. La politique de confidentialité doit être en ligne
avant l'envoi sur Google Play.

1. [ ] **Pages en ligne** après le push sur `main` :
   - <https://monguide.mgapp.workers.dev/confidentialite.html> (Cloudflare) : section « Séjours
     partagés » et date du 16 octobre 2026 ;
   - dans la Play Console, vérifier que « Règles de confidentialité » et
     « Suppression des données » pointent vers les adresses Cloudflare
     (`docs/liens-publics.md`), et non plus vers GitHub Pages, désactivé ;
   - suppression de compte : phrase sur le transfert des séjours partagés.
2. [ ] **Cloudflare** : variable `ANDROID_CERT_SHA256`, l'empreinte SHA-256
   du certificat de signature de l'application (Play Console > Intégrité de
   l'application). Rebuild, puis
   `/.well-known/assetlinks.json` doit renvoyer du JSON.
3. [ ] **Scénario à trois comptes** : A sur Android (APK release de l'étape 6),
   B sur iPhone (Safari, version web), C sur ordinateur. Chaque point doit se
   passer sans erreur.
   - [ ] A crée un séjour, touche « Partager » et donne son prénom.
   - [ ] A crée un lien et l'envoie à B par WhatsApp. B l'ouvre sur iPhone,
     se connecte, voit l'aperçu (ville, dates, prénom de A) et rejoint le
     séjour.
   - [ ] A invite l'adresse e-mail de C, **qui n'a pas de compte**. C crée son
     compte avec cette adresse sur l'ordinateur et voit « A vous a ajouté au
     séjour ». Dans « Participants », A ne voit plus l'invitation en attente.
   - [ ] **Modifications simultanées** : A change un horaire pendant que B
     remplace un lieu. Les deux modifications sont visibles chez les trois en
     moins de 3 s, avec le message en direct. « Modifications » montre qui a
     fait quoi.
   - [ ] **Hors ligne** :
     - A passe en mode avion et fait trois modifications : « Hors ligne · 3
       modifications en attente » ;
     - pendant ce temps, C supprime une étape que A a modifiée ;
     - A force l'arrêt de l'application, la rouvre, puis se reconnecte :
       « Modifications envoyées », et le message « … C a supprimé cette étape ».
   - [ ] **Retrait** : A retire C. Le séjour disparaît chez C à la
     synchronisation suivante, avec le message « Vous ne participez plus… ».
   - [ ] **Départ volontaire** : B touche « Quitter ce séjour ». Le séjour
     disparaît de son iPhone, et A voit un participant de moins. B rouvre
     ensuite le lien, toujours valable, et rejoint de nouveau le séjour.
   - [ ] **Suppression** : A supprime le séjour. Il disparaît chez B avec le
     message « Le séjour … a été supprimé par A ».
4. [ ] **Capture d'écran** de l'écran Participants (séjour réel, sans adresse
   e-mail personnelle visible), en FR et en EN ; à mettre en 2e position dans
   la fiche.
5. [ ] **Play Console** :
   - « Sécurité des données » mis à jour d'après `store/data-safety.md`
     (nouveau type « Nom ») ;
   - fiche FR et EN reprise de `store/listing.md`, avec la section
     « Préparez votre séjour à plusieurs ».
6. [ ] **Version** : `git tag v1.2.0 && git push origin v1.2.0`.
   - `release.yml` en tire la versionName 1.2.0 et une versionCode égale au
     numéro d'exécution, supérieure à celle de la 1.1.x.
   - Téléverser l'`.aab` avec les notes de version de `store/listing.md` :
     « Nouveau : partagez un séjour et préparez-le à plusieurs, en direct. »
7. [ ] Une fois la 1.2.0 installée par la plupart des utilisateurs, relever
   `minAppVersion` puis retirer les politiques `trips_insert_legacy` et
   `trips_update_legacy`, par une migration.

## 8. Mise à jour 1.3.0 : « Voir les avis » (Prompt 9.0, Phase B)

La politique de confidentialité doit être en ligne avant l'envoi sur Google Play.

1. [ ] **Pages en ligne** après le push sur `main` :
   <https://monguide.mgapp.workers.dev/confidentialite.html> contient la phrase
   « Les boutons « Voir les avis » d'un restaurant ouvrent des services tiers… »
   et la date du 17 octobre 2026 ; `/decouvrir.html` mentionne les avis.
2. [ ] **Sécurité des données** : rien à changer. L'application ne collecte
   rien de plus : elle ouvre seulement des liens publics hors de l'application.
3. [ ] **Essais sur appareil** (Phase A) : « Avis Google Maps » ouvre
   l'application Google Maps sur le bon restaurant ; « Avis Tripadvisor » ouvre
   la recherche Tripadvisor (format `/Search?q=` confirmé : 25 bons
   premiers résultats sur 28 vérifiés le 17 octobre 2026) ; sur iPhone et
   ordinateur, nouvel onglet, Mon guide reste ouvert ; hors ligne, choix
   désactivés.
4. [ ] **Version** : `git tag v1.3.0 && git push origin v1.3.0` (versionName
   1.3.0, versionCode = numéro d'exécution de `release.yml`).
5. [ ] **Play Console** : téléverser l'`.aab`, notes de version de
   `store/listing.md` (« Nouveau : voyez les avis d'un restaurant sur Google
   Maps ou Tripadvisor en un appui. »), fiche FR et EN reprise de
   `store/listing.md` (ligne « Voir les avis Google Maps et Tripadvisor en un
   appui »).
