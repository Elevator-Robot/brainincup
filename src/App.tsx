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
  timestamp?: string;
  id?: string;
}

// Our internal interface for conversations
interface Conversation {
  id: string;
  name?: string;
  createdAt?: string;
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showConversations, setShowConversations] = useState(false);
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);
  const [newConversationName, setNewConversationName] = useState('');
  const hardcodedConversationId = "hardcoded-conversation-id";
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch user attributes
  useEffect(() => {
    async function getUserAttributes() {
      const attributes = await fetchUserAttributes();
      setUserAttributes(attributes);
      console.log("👤 Logged-in user:", attributes);
      setIsLoading(false);
      
      // Fetch conversations after getting user attributes
      fetchConversations();
    }
    getUserAttributes();
  }, []);
  
  // Fetch all conversations
  const fetchConversations = async () => {
    try {
      const { data: conversationsList } = await dataClient.models.Conversation.list();
      if (conversationsList) {
        // Map API conversations to our internal Conversation type
        const validConversations = conversationsList
          .filter(conv => conv.id !== null) // Filter out any with null IDs
          .map(conv => {
            // Extract name from participants, handling null values
            let name: string | undefined = undefined;
            if (conv.participants && conv.participants.length > 0) {
              // Convert null to undefined if needed
              name = conv.participants[0] || undefined;
            }
            
            return {
              id: conv.id as string, // We've filtered out nulls, so this is safe
              name: name,
              createdAt: conv.createdAt || undefined
            };
          });
        
        // Sort conversations by createdAt date (newest first)
        const sortedConversations = [...validConversations].sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        
        setConversations(sortedConversations);
        console.log('Fetched conversations:', sortedConversations);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  // Create a new conversation
  const createNewConversation = async () => {
    try {
      if (!newConversationName.trim()) {
        return; // Don't create conversation if name is empty
      }
      
      setIsLoading(true);
      
      // Generate a unique ID for the new conversation
      const newConvId = `conversation-${Date.now()}`;
      
      // Create the conversation in the database
      const { data: newConversation } = await dataClient.models.Conversation.create({
        id: newConvId,
        createdAt: new Date().toISOString(),
        participants: [newConversationName] // Store the name in participants array for now
      });
      
      console.log('Created new conversation:', newConversation);
      
      // Update the conversations list
      await fetchConversations();
      
      // Switch to the new conversation
      if (newConversation) {
        setConversationId(newConversation.id || newConvId);
        setMessages([]);
      }
      
      // Reset and close modal
      setNewConversationName('');
      setShowNewConversationModal(false);
      setIsLoading(false);
      setShowConversations(false);
    } catch (error) {
      console.error('Error creating new conversation:', error);
      setIsLoading(false);
    }
  };

  // Switch to a different conversation
  const switchConversation = async (convId: string) => {
    if (convId === conversationId) {
      setShowConversations(false);
      return;
    }
    
    setIsLoading(true);
    setConversationId(convId);
    setMessages([]);
    setShowConversations(false);
    setIsLoading(false);
  };

  // Fetch conversation history when component mounts or conversationId changes
  useEffect(() => {
    async function fetchConversationHistory() {
      if (!conversationId) return;
      
      try {
        console.log('Fetching conversation history for:', conversationId);
        
        // Fetch user messages
        const { data: userMessages } = await dataClient.models.Message.list({
          filter: { conversationId: { eq: conversationId } }
        });
        
        console.log('Fetched user messages:', userMessages);
        
        // Fetch brain responses
        const { data: brainResponses } = await dataClient.models.BrainResponse.list({
          filter: { conversationId: { eq: conversationId } }
        });
        
        console.log('Fetched brain responses:', brainResponses);
        
        // Combine and sort messages by timestamp
        const combinedMessages: Message[] = [];
        
        // Add user messages
        if (userMessages) {
          userMessages.forEach(msg => {
            combinedMessages.push({
              id: msg.id || '',
              role: 'user',
              content: msg.content || '',
              timestamp: msg.timestamp || new Date().toISOString()
            });
          });
        }
        
        // Add brain responses
        if (brainResponses) {
          brainResponses.forEach(resp => {
            combinedMessages.push({
              id: resp.id || '',
              role: 'assistant',
              content: resp.response || '',
              timestamp: resp.createdAt || new Date().toISOString()
            });
          });
        }
        
        // Sort by timestamp
        combinedMessages.sort((a, b) => {
          if (!a.timestamp || !b.timestamp) return 0;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });
        
        console.log('Combined and sorted messages:', combinedMessages);
        
        // Update state with fetched messages
        if (combinedMessages.length > 0) {
          setMessages(combinedMessages);
        }
      } catch (error) {
        console.error('Error fetching conversation history:', error);
      }
    }
    
    fetchConversationHistory();
  }, [conversationId]);

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
            if (brainResponse.conversationId === conversationId && 
                brainResponse.owner === "f4e87478-d071-709a-9f5d-115e1e1562df") {
              console.log('✅ MATCH: Adding response to messages:', brainResponse.response);
              setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: brainResponse.response || '',
                id: brainResponse.id,
                timestamp: brainResponse.createdAt
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
        // Check if conversation already exists
        const { data: existingConversations } = await dataClient.models.Conversation.list({
          filter: { id: { eq: hardcodedConversationId } }
        });
        
        if (existingConversations && existingConversations.length > 0) {
          // Use existing conversation
          convId = existingConversations[0].id || hardcodedConversationId;
          console.log('Using existing conversation ID:', convId);
        } else {
          // Create new conversation
          const { data: newConversation } = await dataClient.models.Conversation.create({
            id: hardcodedConversationId
          });
          convId = newConversation?.id || hardcodedConversationId;
          console.log('Created new conversation ID:', convId);
        }
        
        setConversationId(convId);
      }

      const { data: savedMessage } = await dataClient.models.Message.create({
        content,
        conversationId: convId,
        timestamp: new Date().toISOString()
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
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: userMessage,
      timestamp: new Date().toISOString()
    }]);
    setInputMessage('');

    await handleSendMessage(userMessage);
    // Assistant reply will come via subscription
  };

  // Toggle conversations sidebar
  const toggleConversations = () => {
    setShowConversations(!showConversations);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-brand-bg-dark via-brand-bg-light to-brand-bg-dark relative">
      <Header />

      {/* Conversations Sidebar */}
      <div className={`fixed left-0 top-0 bottom-0 w-64 bg-brand-surface-dark border-r border-brand-surface-border z-40 transform transition-transform duration-300 ease-in-out ${showConversations ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-brand-surface-border">
          <h2 className="text-brand-text-primary text-lg font-medium">Conversations</h2>
        </div>
        
        <div className="p-4">
          <button 
            onClick={() => setShowNewConversationModal(true)}
            className="w-full py-2 px-4 mb-4 rounded-lg bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary text-brand-text-primary flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Conversation
          </button>
          
          <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => switchConversation(conv.id)}
                className={`w-full text-left py-2 px-3 rounded-lg transition-colors ${
                  conv.id === conversationId
                    ? 'bg-brand-accent-primary/20 text-brand-accent-primary'
                    : 'text-brand-text-secondary hover:bg-brand-surface-border'
                }`}
              >
                <div className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate">
                    {conv.name || (conv.createdAt 
                      ? new Date(conv.createdAt).toLocaleDateString() 
                      : 'Conversation ' + conv.id.substring(0, 8))}
                  </span>
                </div>
              </button>
            ))}
            
            {conversations.length === 0 && (
              <p className="text-sm text-brand-text-muted text-center py-4">
                No conversations yet
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Toggle Button for Conversations */}
      <button 
        onClick={toggleConversations}
        className="fixed left-4 top-20 z-30 p-2 rounded-full bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary text-brand-text-primary shadow-lg hover:opacity-90 transition-opacity"
        aria-label="Toggle conversations"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      {/* New Conversation Modal */}
      {showNewConversationModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setShowNewConversationModal(false)}
          >
            <div 
              className="bg-brand-surface-dark border border-brand-surface-border rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-medium text-brand-text-primary mb-4">Create New Conversation</h3>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                createNewConversation();
              }}>
                <div className="mb-4">
                  <label htmlFor="conversation-name" className="block text-sm font-medium text-brand-text-secondary mb-2">
                    Conversation Name
                  </label>
                  <input
                    id="conversation-name"
                    type="text"
                    value={newConversationName}
                    onChange={(e) => setNewConversationName(e.target.value)}
                    placeholder="Enter a name for this conversation"
                    className="w-full px-4 py-3 rounded-lg bg-brand-surface-dark border border-brand-surface-border 
                    text-brand-text-primary placeholder-brand-text-muted
                    focus:outline-none focus:border-brand-accent-primary focus:ring-2 focus:ring-brand-accent-primary/20"
                    autoFocus
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowNewConversationModal(false)}
                    className="px-4 py-2 rounded-lg border border-brand-surface-border text-brand-text-secondary 
                    hover:bg-brand-surface-border transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newConversationName.trim()}
                    className={`px-4 py-2 rounded-lg bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary 
                    text-brand-text-primary transition-opacity ${!newConversationName.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Overlay when sidebar is open */}
      {showConversations && (
        <div 
          className="fixed inset-0 bg-black/50 z-30"
          onClick={toggleConversations}
        ></div>
      )}

      {/* Scrollable content with bottom padding for input + footer */}
      <main className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full px-4 pt-20 pb-40 space-y-6">
        {messages.length === 0 && !isLoading && (
          <div className="flex justify-center items-center h-full">
            <p className="text-brand-text-muted text-center">
              Start a conversation with the Brain in Cup...
            </p>
          </div>
        )}
        
        {isLoading && (
          <div className="flex justify-center items-center h-full">
            <p className="text-brand-text-muted">Loading conversation history...</p>
          </div>
        )}
        
        {messages.map((message, index) => (
          <div
            key={message.id || index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${generateGradient(message.role)} 
              ${message.role === 'user' ? 'text-brand-text-primary' : 'text-brand-text-secondary'}`}
            >
              <p className="leading-relaxed">{message.content}</p>
              {message.timestamp && (
                <p className="text-xs opacity-50 mt-2">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              )}
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
          <p>Messages in memory: {messages.length}</p>
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
