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
- [ ] Coordonnées : e-mail de contact, site web https://anthonystocko.github.io/Monguide/

## 4. Contenu de l'application (Play Console > Règles et programmes > Contenu de l'application)

- [ ] **Règles de confidentialité** : https://anthonystocko.github.io/Monguide/fr/confidentialite.html
      (version anglaise : `/en/privacy.html`).
- [ ] **Suppression de compte** (création de compte dans l'application) :
      URL https://anthonystocko.github.io/Monguide/fr/suppression-compte.html ;
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
