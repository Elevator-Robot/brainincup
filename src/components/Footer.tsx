
function Footer() {
  return (
    <footer className="bg-brand-surface-dark text-brand-text-secondary py-4 border-t border-brand-surface-border">
      <div className="max-w-6xl mx-auto text-center text-sm">
        © {new Date().getFullYear()} Brain in Cup. All rights reserved.
      </div>
    </footer>
  );
}

export default Footer;
