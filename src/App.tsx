import { useEffect, useState, useRef } from 'react';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import Header from './components/Header';
import Footer from './components/Footer';

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
  const hardcodedConversationId = 'hardcoded-conversation-id';
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function getUserAttributes() {
      const attributes = await fetchUserAttributes();
      setUserAttributes(attributes);
      console.log('👤 Logged-in user:', attributes);
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

    console.log('Setting up subscription for conversation:', conversationId);
    
    try {
      console.log('Setting up raw subscription without filters');
      
      // Use the raw GraphQL subscription without filters
      const subscription = dataClient.graphql({
        query: `
          subscription OnCreateBrainResponse {
            onCreateBrainResponse {
              id
              conversationId
              response
              owner
              messageId
              createdAt
            }
          }
        `
      });
      
      // Add proper type for the subscription
      type GraphQLSubscriptionResult = {
        data?: {
          onCreateBrainResponse?: {
            id: string;
            conversationId: string;
            response: string;
            owner: string;
            messageId: string;
            createdAt: string;
          };
        };
        errors?: Array<{ message: string }>;
      };
      
      const rawSubscription = subscription.subscribe({
        next: (result: GraphQLSubscriptionResult) => {
          console.log('RAW SUBSCRIPTION RECEIVED:', result);
          
          // Try to extract the data
          const brainResponse = result.data?.onCreateBrainResponse;
          if (brainResponse) {
            console.log('Extracted brain response:', brainResponse);
            console.log('Current conversation ID:', conversationId);
            console.log('Response conversation ID:', brainResponse.conversationId);
            console.log('Response owner:', brainResponse.owner);
            
            // Check if this response is for our conversation
            if (brainResponse.conversationId === conversationId && 
                brainResponse.owner === 'f4e87478-d071-709a-9f5d-115e1e1562df') {
              console.log('✅ MATCH: Adding response to messages:', brainResponse.response);
              setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: brainResponse.response ?? '' 
              }]);
              setIsWaitingForResponse(false);
            } else {
              console.log('❌ NO MATCH: Response does not match criteria');
            }
          }
        },
        error: (err: Error) => {
          console.error('Raw subscription error:', err);
          setIsWaitingForResponse(false);
        }
      });
      
      return () => {
        console.log('Cleaning up raw subscription');
        rawSubscription.unsubscribe();
      };
    } catch (error) {
      console.error('Error setting up raw subscription:', error);
      return () => {}; // Empty cleanup function
    }
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
      <main className="flex-1 overflow-y-auto max-w-4xl mx-auto w-full px-3 sm:px-4 pt-20 pb-40 space-y-4 sm:space-y-6">
        {messages.length === 0 && !isLoading && (
          <div className="flex justify-center items-center h-full">
            <p className="text-brand-text-muted text-center px-4">
              Start a conversation with the Brain in Cup...
            </p>
          </div>
        )}
        
        {isLoading && (
          <div className="flex justify-center items-center h-full">
            <p className="text-brand-text-muted">Loading...</p>
          </div>
        )}
        
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-3 sm:p-4 shadow-sm ${generateGradient(message.role)} 
              ${message.role === 'user' ? 'text-brand-text-primary' : 'text-brand-text-secondary'}`}
            >
              <p className="leading-relaxed text-sm sm:text-base break-words">{message.content}</p>
            </div>
          </div>
        ))}
        
        {isWaitingForResponse && (
          <div className="flex justify-start">
            <div className="max-w-[85%] sm:max-w-[80%] rounded-2xl p-3 sm:p-4 shadow-sm bg-gradient-to-r from-purple-900/30 to-slate-800/30 text-brand-text-secondary">
              <div className="flex space-x-2">
                <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-150"></div>
                <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-300"></div>
              </div>
            </div>
          </div>
        )}
        
        {/* Debug info - hidden on mobile */}
        <div className="mt-4 p-2 bg-gray-800/50 rounded text-xs text-gray-400 hidden sm:block">
          <p>Conversation ID: {conversationId || 'None'}</p>
          <p>User: {userAttributes?.sub || 'Unknown'}</p>
          <p>Waiting for response: {isWaitingForResponse ? 'Yes' : 'No'}</p>
        </div>
        
        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </main>

      {/* Bottom stack: input bar on top, footer below it */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        {/* Input Bar */}
        <div className="bg-brand-surface-dark border-t border-brand-surface-border pointer-events-auto">
          <div className="max-w-4xl mx-auto p-3 sm:p-4">
            <form onSubmit={handleSubmit} className="flex gap-2 sm:gap-3">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 rounded-full px-4 sm:px-6 py-2 sm:py-3 bg-brand-surface-dark border border-brand-surface-border 
                text-brand-text-primary placeholder-brand-text-muted text-sm sm:text-base
                focus:outline-none focus:border-brand-accent-primary focus:ring-2 focus:ring-brand-accent-primary/20 
                transition-all duration-200"
                disabled={isWaitingForResponse}
              />
              <button
                type="submit"
                className={`px-4 sm:px-8 py-2 sm:py-3 rounded-full bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary 
                text-brand-text-primary shadow-sm transition-all duration-200 text-sm sm:text-base
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
        <div className="bg-brand-surface-dark border-brand-surface-border text-center text-xs sm:text-sm text-brand-text-muted py-2 pointer-events-auto">
          <Footer />
        </div>
      </div>
    </div>
  );
}

export default App;
