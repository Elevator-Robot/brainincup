export default function SiteFooter() {
  return <footer className="site-footer">
    <span className="site-footer-spark" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.5 13.7 9l5.3 1.7-5.3 1.7L12 17.7 10.3 12.4 5 10.7 10.3 9 12 3.5Z" />
      </svg>
    </span>
    <span>Crafted by</span>{' '}
    <a href="https://elevatorrobot.com" target="_blank" rel="noopener noreferrer">Elevator Robot</a>
  </footer>;
}
