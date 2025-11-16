interface BrainIconProps {
  className?: string;
}

export default function BrainIcon({ className = "w-5 h-5" }: BrainIconProps) {
  return (
    <img 
      src="/brain-chat.svg" 
      alt="Brain in Cup" 
      className={`${className} drop-shadow-lg filter brightness-110 contrast-125`}
      style={{ imageRendering: 'crisp-edges' }}
    />
  );
}
