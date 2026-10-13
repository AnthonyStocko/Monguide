import Logo from '../brand/Logo.jsx';

/**
 * Version web, écrans de plus de 1024 px : logo à gauche de la colonne de
 * l'application. Décoratif : le nom est déjà porté par la barre du haut.
 */
export default function DesktopLogo() {
  return (
    <div aria-hidden="true" className="fixed top-8 left-8 hidden min-[1025px]:block">
      <Logo className="h-10 w-auto" />
    </div>
  );
}
