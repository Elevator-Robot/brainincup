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

const generateGradient = (role: 'user' | 'assistant') => {
  return role === 'user'
    ? 'bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary'
    : 'bg-gradient-to-r from-purple-900/30 to-slate-800/30';
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userAttributes, setUserAttributes] = useState<Record<string, string | undefined> | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { signOut } = useAuthenticator();
  const hardcodedConversationId = "hardcoded-conversation-id";

  useEffect(() => {
    async function getUserAttributes() {
      const attributes = await fetchUserAttributes();
      setUserAttributes(attributes);
      console.log("👤 Logged-in user:", attributes); // 👈 Add this
      setIsLoading(false);
    }
    getUserAttributes();
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    console.log('Subscribing to conversation:', conversationId);
    const sub = dataClient.models.BrainResponse.onCreate().subscribe({
      next: (brainResponse) => {
        console.log('User attributes:', brainResponse);
        console.log('WE ARE HERE');

        if (brainResponse?.conversationId === conversationId) {
          setMessages(prev => [...prev, { role: 'assistant', content: brainResponse.response ?? '' }]);
        }
      },
      error: (err) => {
        console.error('Subscription error:', err);
      }
    });

    return () => sub.unsubscribe();
  }, [conversationId]);

  const handleSendMessage = async (content: string): Promise<void> => {
    try {
      let convId = conversationId || hardcodedConversationId;
      if (!conversationId) {
        const { data: newConversation } = await dataClient.models.Conversation.create({
          id: hardcodedConversationId
        });
        convId = newConversation?.id || hardcodedConversationId;
        setConversationId(convId);
      }

      const { data: savedMessage } = await dataClient.models.Message.create({
        content,
        conversationId: convId
      });

      console.log('Message saved to backend:', savedMessage);
    } catch (error) {
      console.error('Error sending message to backend:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');

    await handleSendMessage(userMessage);
    // Assistant reply will come via subscription
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg-dark via-brand-bg-light to-brand-bg-dark">
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

        <div className="fixed bottom-0 left-0 right-0 bg-brand-surface-dark backdrop-blur-md border-t border-brand-surface-border">
          <div className="max-w-6xl mx-auto p-4">
            <form onSubmit={handleSubmit} className="flex gap-3">
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
