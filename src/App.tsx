import { useEffect, useState, useRef } from "react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";
import Header from "./components/Header";
import Footer from "./components/Footer";

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
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const hardcodedConversationId = "hardcoded-conversation-id";
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function getUserAttributes() {
      const attributes = await fetchUserAttributes();
      setUserAttributes(attributes);
      console.log("👤 Logged-in user:", attributes);
      setIsLoading(false);
    }
    getUserAttributes();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (!conversationId) return;

    console.log('Subscribing to conversation:', conversationId);
    
    // Subscribe to ALL BrainResponse creations, not just for this conversation
    const sub = dataClient.models.BrainResponse.onCreate().subscribe({
      next: (brainResponse) => {
        console.log('Received brain response:', brainResponse);
        
        // Check if this response is for our conversation
        if (brainResponse?.conversationId === conversationId) {
          console.log('Adding response to messages:', brainResponse.response);
          setMessages(prev => [...prev, { role: 'assistant', content: brainResponse.response ?? '' }]);
          setIsWaitingForResponse(false);
        } else {
          console.log('Ignoring response for different conversation:', brainResponse.conversationId);
        }
      },
      error: (err) => {
        console.error('Subscription error:', err);
        setIsWaitingForResponse(false);
      }
    });

    return () => {
      console.log('Unsubscribing from BrainResponse');
      sub.unsubscribe();
    };
  }, [conversationId]);

  const handleSendMessage = async (content: string): Promise<void> => {
    try {
      setIsWaitingForResponse(true);
      
      let convId = conversationId || hardcodedConversationId;
      if (!conversationId) {
        const { data: newConversation } = await dataClient.models.Conversation.create({
          id: hardcodedConversationId
        });
        convId = newConversation?.id || hardcodedConversationId;
        setConversationId(convId);
        console.log('Created/using conversation ID:', convId);
      }

      const { data: savedMessage } = await dataClient.models.Message.create({
        content,
        conversationId: convId
      });

      console.log('Message saved to backend:', savedMessage);
    } catch (error) {
      console.error('Error sending message to backend:', error);
      setIsWaitingForResponse(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isWaitingForResponse) return;

    const userMessage = inputMessage;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');

    await handleSendMessage(userMessage);
    // Assistant reply will come via subscription
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-brand-bg-dark via-brand-bg-light to-brand-bg-dark relative">
      <Header />

      {/* Scrollable content with bottom padding for input + footer */}
      <main className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full px-4 pt-20 pb-40 space-y-6">
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
        
        {isWaitingForResponse && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl p-4 shadow-sm bg-gradient-to-r from-purple-900/30 to-slate-800/30 text-brand-text-secondary">
              <div className="flex space-x-2">
                <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-150"></div>
                <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-300"></div>
              </div>
            </div>
          </div>
        )}
        
        {/* Debug info */}
        <div className="mt-4 p-2 bg-gray-800/50 rounded text-xs text-gray-400">
          <p>Conversation ID: {conversationId || 'None'}</p>
          <p>User: {userAttributes?.sub || 'Unknown'}</p>
          <p>Waiting for response: {isWaitingForResponse ? 'Yes' : 'No'}</p>
        </div>
        
        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </main>

      {/* ✅ Bottom stack: input bar on top, footer below it */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        {/* Input Bar */}
        <div className="bg-brand-surface-dark border-t border-brand-surface-border pointer-events-auto">
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
                disabled={isWaitingForResponse}
              />
              <button
                type="submit"
                className={`px-8 py-3 rounded-full bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary 
                text-brand-text-primary shadow-sm transition-all duration-200 
                focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/20
                ${isWaitingForResponse 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:opacity-90'}`}
                disabled={isWaitingForResponse}
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Footer stays stuck to the very bottom */}
        <div className="bg-brand-surface-dark border-brand-surface-border text-center text-sm text-brand-text-muted py-2 pointer-events-auto">
          <Footer />
        </div>
      </div>
    </div>
  );
}

export default App;
