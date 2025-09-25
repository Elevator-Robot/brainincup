function Footer() {
  return (
    <div className="flex items-center justify-center gap-2 text-brand-text-muted">
      <span>Powered by</span>
      <div className="flex items-center gap-1">
        <div className="w-4 h-4 rounded-md bg-gradient-mesh flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} 
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <span className="font-medium text-brand-text-primary">Brain in Cup AI</span>
      </div>
    </div>
  );
}

export default Footer;