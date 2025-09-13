import { useAuthenticator } from '@aws-amplify/ui-react';

function Header() {
  const { signOut } = useAuthenticator();

  return (
    <header className="bg-brand-surface-dark backdrop-blur-md border-b border-brand-surface-border fixed top-0 w-full z-10">
      <div className="max-w-4xl mx-auto flex justify-between items-center p-3 sm:p-4">
        <h1 className="text-xl sm:text-2xl font-light text-brand-text-primary">Brain in Cup</h1>
        <button
          onClick={signOut}
          className="px-3 sm:px-4 py-2 text-xs sm:text-sm text-brand-text-secondary hover:text-brand-text-primary transition-colors duration-200"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

export default Header;
