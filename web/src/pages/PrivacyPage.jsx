import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

const CONTACT_EMAIL = 'anthony.mourier@gmail.com';

// Page publique à déclarer à Google Play comme règles de confidentialité :
// https://monguide.alwaysdata.net/confidentialite
// Modèle de départ : à compléter dès que l'appli collecte d'autres données que
// le compte, et à garder en phase avec le questionnaire « Sécurité des données ».
export default function PrivacyPage() {
  return (
    <div className="min-h-screen p-4 bg-gradient-to-b from-indigo-50 to-white">
      <article className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-6 space-y-5 text-slate-700">
        <header className="flex flex-col items-center gap-2 text-center">
          <span className="bg-indigo-100 text-indigo-600 rounded-full p-3">
            <ShieldCheck size={28} />
          </span>
          <h1 className="text-xl font-semibold text-slate-900">Règles de confidentialité de Mon guide</h1>
          <p className="text-sm text-slate-500">Dernière mise à jour : à compléter</p>
        </header>

        <Section title="Qui sommes-nous ?">
          <p>
            Mon guide est éditée par Anthony Mourier, développeur indépendant. Pour toute question sur vos
            données :{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 underline">{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section title="Données collectées">
          <ul className="list-disc pl-5 space-y-1">
            <li>Compte : nom, adresse e-mail, mot de passe (stocké chiffré, jamais lisible).</li>
          </ul>
          <p>
            L'application ne collecte ni position, ni contacts, ni photos, ni identifiant publicitaire.
            Elle n'utilise aucun outil de statistiques, de publicité ou de suivi.
          </p>
        </Section>

        <Section title="Pourquoi ces données ?">
          <p>
            Uniquement pour faire fonctionner l'application et se connecter au compte. Elles ne sont jamais
            vendues, louées ni partagées à des fins publicitaires.
          </p>
        </Section>

        <Section title="Hébergement et sécurité">
          <p>
            Les données sont hébergées chez alwaysdata (France). Tous les échanges passent par une connexion
            chiffrée (HTTPS) et les mots de passe sont hachés (bcrypt). L'application stocke seulement un jeton
            de session sur l'appareil pour garder l'utilisateur connecté.
          </p>
        </Section>

        <Section title="Conservation et suppression">
          <p>
            Les données sont conservées tant que le compte existe. Vous pouvez supprimer définitivement votre
            compte et toutes les données associées depuis les Réglages de l'application ou sur la page{' '}
            <Link to="/suppression-compte" className="text-indigo-600 underline">suppression du compte</Link>.
            La suppression est immédiate et aucune donnée n'est conservée ensuite.
          </p>
        </Section>

        <Section title="Vos droits">
          <p>
            Conformément au RGPD, vous pouvez accéder à vos données, les corriger, les supprimer ou demander leur
            export en écrivant à{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 underline">{CONTACT_EMAIL}</a>.
            Vous pouvez aussi saisir la CNIL (cnil.fr).
          </p>
        </Section>

        <p className="text-sm text-center pt-2">
          <Link to="/" className="text-indigo-600 font-medium underline">Retour à l'application</Link>
        </p>
      </article>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
