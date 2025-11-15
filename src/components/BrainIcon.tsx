interface BrainIconProps {
  className?: string;
}

export default function BrainIcon({ className = "w-5 h-5" }: BrainIconProps) {
  return (
    <img 
      src="/brain-chat.svg" 
      alt="Brain in Cup" 
      className={className}
    />
  );
}
