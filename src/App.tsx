import { useEffect, useState } from "react";
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchUserAttributes } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";

const dataClient = generateClient<Schema>();

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Add these color utility functions
const generateGradient = (role: 'user' | 'assistant') => {
  return role === 'user'
    ? 'bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary'
    : 'bg-gradient-to-r from-purple-900/30 to-slate-800/30'; // Subtle purple tint
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userAttributes, setUserAttributes] = useState<Record<string, string | undefined> | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const { signOut } = useAuthenticator();

  console.log(userAttributes);
  useEffect(() => {
    async function getUserAttributes() {
      const attributes = await fetchUserAttributes();
      setUserAttributes(attributes);
      setIsLoading(false);
    }
    getUserAttributes();
  }, []);

  const handleSendMessage = async (content: string) => {
    try {
      console.log("Available models:", Object.keys(dataClient.models));
      const { data: savedMessage } = await dataClient.models.Message.create({ content });
      console.log('Message saved to backend:', savedMessage);
    } catch (error) {
      console.error('Error sending message to backend:', error);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: inputMessage }]);

    handleSendMessage(inputMessage);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `This is a mock response to: "${inputMessage}"`
      }]);
    }, 1000);

    setInputMessage('');
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg-dark via-brand-bg-light to-brand-bg-dark">
      {/* Header */}
      <header className="bg-brand-surface-dark backdrop-blur-md border-b border-brand-surface-border fixed top-0 w-full z-10">
        <div className="max-w-6xl mx-auto flex justify-between items-center p-4">
          <h1 className="text-2xl font-light text-brand-text-primary">Brain in Cup</h1>
          <button
            onClick={signOut}
            className="px-4 py-2 text-sm text-brand-text-secondary hover:text-brand-text-primary transition-colors duration-200"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-col pt-20 pb-24 min-h-screen w-full">
        {/* Chat Container */}
        <main className="flex-1 overflow-auto space-y-6 max-w-6xl mx-auto w-full px-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${generateGradient(message.role)} 
                  ${message.role === 'user' ? 'text-brand-text-primary' : 'text-brand-text-secondary'}`}
              >
                <p className="leading-relaxed">{message.content}</p>
              </div>
            </div>
          ))}
        </main>

        {/* Input Form */}
        <div className="fixed bottom-0 left-0 right-0 bg-brand-surface-dark backdrop-blur-md border-t border-brand-surface-border">
          <div className="max-w-6xl mx-auto p-4">
            <form
              onSubmit={handleSubmit}
              className="flex gap-3"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 rounded-full px-6 py-3 bg-brand-surface-dark border border-brand-surface-border 
                  text-brand-text-primary placeholder-brand-text-muted
                  focus:outline-none focus:border-brand-accent-primary focus:ring-2 focus:ring-brand-accent-primary/20 
                  transition-all duration-200"
              />
              <button
                type="submit"
                className="px-8 py-3 rounded-full bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary 
                  text-brand-text-primary shadow-sm hover:opacity-90 transition-all duration-200 
                  focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/20"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
