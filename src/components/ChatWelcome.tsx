interface ChatWelcomeProps {
  isGameMasterMode: boolean;
  isSettingUp?: boolean;
  onPrompt: (prompt: string) => void;
}

export default function ChatWelcome({ isGameMasterMode, isSettingUp, onPrompt }: ChatWelcomeProps) {
  if (isGameMasterMode && isSettingUp) return null;
  const prompts = isGameMasterMode
    ? ['Look around', 'Check my inventory', 'Describe the area']
    : ['Explain a concept', 'Work through a problem', 'Review an idea'];
  return <section className="cosmic-welcome" aria-label="Start a conversation">
    {!isGameMasterMode && <h2>New conversation</h2>}
    {!isSettingUp && <div className="cosmic-prompt-list">{prompts.map(prompt => <button key={prompt} type="button" onClick={() => onPrompt(prompt)}>{prompt}<span aria-hidden="true">↗</span></button>)}</div>}
  </section>;
}
