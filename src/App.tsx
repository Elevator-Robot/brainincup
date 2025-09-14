import { useEffect, useState, useRef } from 'react';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import Footer from './components/Footer';
import ConversationList from './components/ConversationList';

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [conversationListKey, setConversationListKey] = useState(0);
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
      
      const rawSubscription = (subscription as any).subscribe({
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
            if (brainResponse.conversationId === conversationId) {
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
      
      if (!conversationId) {
        console.error('No conversation ID available');
        setIsWaitingForResponse(false);
        return;
      }

      const { data: savedMessage } = await dataClient.models.Message.create({
        content,
        conversationId: conversationId
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

  const handleSelectConversation = async (selectedConversationId: string) => {
    setConversationId(selectedConversationId);
    setMessages([]); // Clear current messages
    
    // Load messages for this conversation
    try {
      const { data: conversationMessages } = await dataClient.models.Message.list({
        filter: { conversationId: { eq: selectedConversationId } }
      });
      
      const { data: brainResponses } = await dataClient.models.BrainResponse.list({
        filter: { conversationId: { eq: selectedConversationId } }
      });
      
      // Create a timeline of messages and responses
      const timeline: Message[] = [];
      
      // Sort messages by timestamp
      const sortedMessages = (conversationMessages || []).sort((a, b) => {
        const aTime = new Date(a.timestamp || a.createdAt || 0).getTime();
        const bTime = new Date(b.timestamp || b.createdAt || 0).getTime();
        return aTime - bTime;
      });
      
      // For each message, add it and its corresponding response
      sortedMessages.forEach(msg => {
        timeline.push({ role: 'user', content: msg.content || '' });
        
        // Find corresponding brain response
        const response = brainResponses?.find(br => br.messageId === msg.id);
        if (response?.response) {
          timeline.push({ role: 'assistant', content: response.response });
        }
      });
      
      setMessages(timeline);
    } catch (error) {
      console.error('Error loading conversation messages:', error);
    }
  };

  const handleNewConversation = async () => {
    try {
      // For development testing, create a mock conversation
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
        const mockConversationId = 'test-conversation-' + Date.now();
        console.log('✅ Test mode: Creating mock conversation:', mockConversationId);
        setConversationId(mockConversationId);
        setMessages([]);
        return;
      }

      // Get current user for participants
      const currentUserId = userAttributes?.sub || userAttributes?.email || 'anonymous';
      
      const { data: newConversation } = await dataClient.models.Conversation.create({
        participants: [currentUserId] // Add current user to participants
        // createdAt and updatedAt are handled automatically by Amplify
      });
      
      if (newConversation) {
        setConversationId(newConversation.id);
        setMessages([]);
        console.log('Created new conversation:', newConversation.id);
        
        // Trigger a refresh of the conversation list
        setConversationListKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error creating new conversation:', error);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-brand-bg-dark via-brand-bg-light to-brand-bg-dark">
      {/* Mobile overlay for sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-50 w-80 
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${!isSidebarOpen ? 'lg:w-0 lg:overflow-hidden' : ''}
      `}>
        <div className="flex flex-col h-full bg-brand-surface-dark border-r border-brand-surface-border">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b border-brand-surface-border">
            <h1 className="text-xl font-bold text-brand-text-primary">Brain in Cup</h1>
            <button
              onClick={toggleSidebar}
              className="lg:hidden p-2 rounded-md text-brand-text-muted hover:text-brand-text-primary
              hover:bg-brand-surface-border transition-colors"
            >
              ×
            </button>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            <ConversationList 
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              selectedConversationId={conversationId}
              refreshKey={conversationListKey}
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-brand-surface-dark border-b border-brand-surface-border">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-md text-brand-text-muted hover:text-brand-text-primary
            hover:bg-brand-surface-border transition-colors lg:hidden"
          >
            ☰
          </button>
          <div className="hidden lg:block"></div>
          <button
            onClick={async () => {
              try {
                const { signOut } = await import('aws-amplify/auth');
                await signOut();
                window.location.reload();
              } catch (error) {
                console.error('Error signing out:', error);
              }
            }}
            className="px-4 py-2 text-sm text-brand-text-secondary hover:text-brand-text-primary transition-colors duration-200"
          >
            Sign out
          </button>
        </div>

        {/* Chat Area */}
        {conversationId ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !isLoading && (
                <div className="flex justify-center items-center h-full">
                  <p className="text-brand-text-muted text-center">
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
              <div className="mt-4 p-2 bg-brand-surface-dark rounded text-xs text-brand-text-secondary hidden sm:block">
                <p>Conversation ID: {conversationId || 'None'}</p>
                <p>User: {userAttributes?.sub || 'Unknown'}</p>
                <p>Waiting for response: {isWaitingForResponse ? 'Yes' : 'No'}</p>
              </div>
              
              {/* Invisible element to scroll to */}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-brand-surface-border bg-brand-surface-dark p-4">
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
        ) : (
          // Welcome/Empty State
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-brand-text-primary mb-4">
                Welcome to Brain in Cup
              </h2>
              <p className="text-brand-text-muted mb-6">
                Select a conversation from the sidebar or create a new one to get started.
              </p>
              <button
                onClick={handleNewConversation}
                className="px-6 py-3 rounded-full bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary 
                text-brand-text-primary shadow-sm transition-all duration-200 hover:opacity-90
                focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/20"
              >
                Start New Conversation
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-brand-surface-dark border-t border-brand-surface-border text-center text-xs text-brand-text-muted py-2">
          <Footer />
        </div>
      </div>
    </div>
  );
}

export default App;
