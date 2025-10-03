import { useEffect, useState, useRef } from 'react';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import Footer from './components/Footer';
import ConversationList from './components/ConversationList';

const dataClient = generateClient<Schema>();

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isTyping?: boolean;
  fullContent?: string; // Store the complete content when typing
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userAttributes, setUserAttributes] = useState<Record<string, string | undefined> | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default to closed on mobile, will be controlled by responsive logic
  const [conversationListKey, setConversationListKey] = useState(0);
  const [newConversationId, setNewConversationId] = useState<string | null>(null); // Track newly created conversation needing name
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function getUserAttributes() {
      try {
        // For test mode, set mock user attributes
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('testmode') === 'true') {
          console.log('✅ Test mode: Setting mock user attributes');
          setUserAttributes({ sub: 'test-user-123', email: 'test@example.com' });
          setIsLoading(false);
          return;
        }

        const attributes = await fetchUserAttributes();
        setUserAttributes(attributes);
        console.log('👤 Logged-in user:', attributes);
        setIsLoading(false);
      } catch (error) {
        console.error('❌ Error fetching user attributes:', error);
        setIsLoading(false);
      }
    }
    getUserAttributes();
  }, []);

  // Auto-load most recent conversation or create new one on app start
  useEffect(() => {
    async function autoLoadConversation() {
      if (!userAttributes || conversationId) return; // Don't run if already have conversation or no user
      
      try {
        console.log('🔄 Auto-loading conversation...');
        
        // For test mode, auto-select test conversation or create new one
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('testmode') === 'true') {
          if (urlParams.get('noconversations') === 'true') {
            console.log('✅ Test mode: No conversations, creating new one');
            await handleNewConversation();
          } else {
            console.log('✅ Test mode: Auto-selecting test conversation');
            setConversationId('test-conversation-1');
          }
          return;
        }

        // Load existing conversations
        const { data: conversations } = await dataClient.models.Conversation.list();
        
        if (conversations && conversations.length > 0) {
          // Sort by most recent and select the first one
          const sortedConversations = conversations.sort((a, b) => {
            const aDate = new Date(a.updatedAt || a.createdAt || 0);
            const bDate = new Date(b.updatedAt || b.createdAt || 0);
            return bDate.getTime() - aDate.getTime();
          });
          
          const mostRecentConversation = sortedConversations[0];
          console.log('✅ Auto-loaded most recent conversation:', mostRecentConversation.id);
          await handleSelectConversation(mostRecentConversation.id!);
        } else {
          // No conversations exist, create a new one
          console.log('📝 No conversations found, creating new one...');
          await handleNewConversation();
        }
      } catch (error) {
        console.error('❌ Error auto-loading conversation:', error);
        // Fallback: create new conversation
        try {
          await handleNewConversation();
        } catch (fallbackError) {
          console.error('❌ Fallback new conversation failed:', fallbackError);
        }
      }
    }

    autoLoadConversation();
  }, [userAttributes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC closes sidebar
      if (e.key === 'Escape' && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
      // Ctrl/Cmd + K focuses composer
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // Ctrl/Cmd + D toggles debug info
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        setShowDebugInfo(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  // Cleanup typing animation when conversation changes or component unmounts
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    };
  }, [conversationId]);

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
      
      const rawSubscription = (subscription as unknown as { subscribe: (handlers: { next: (result: GraphQLSubscriptionResult) => void; error: (err: Error) => void; }) => { unsubscribe: () => void; }; }).subscribe({
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
              console.log('✅ MATCH: Starting typing animation for response:', brainResponse.response);
              
              // Add empty assistant message to start typing animation
              setMessages(prev => {
                const newMessages: Message[] = [...prev, { 
                  role: 'assistant' as const, 
                  content: '',
                  isTyping: true,
                  fullContent: brainResponse.response ?? ''
                }];
                
                // Start typing animation for the newly added message
                const messageIndex = newMessages.length - 1;
                setTimeout(() => {
                  startTypingAnimation(messageIndex, brainResponse.response ?? '');
                }, 100); // Small delay to ensure state is updated
                
                return newMessages;
              });
              
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

  // Typing animation function
  const startTypingAnimation = (messageIndex: number, fullText: string) => {
    // Clear any existing typing animation
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }

    let currentIndex = 0;
    const typingSpeed = 30; // Characters per second

    const typeNextCharacter = () => {
      if (currentIndex < fullText.length) {
        setMessages(prev => {
          const updatedMessages = [...prev];
          if (updatedMessages[messageIndex]) {
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              content: fullText.substring(0, currentIndex + 1),
              isTyping: true,
              fullContent: fullText
            };
          }
          return updatedMessages;
        });
        currentIndex++;
      } else {
        // Typing complete
        setMessages(prev => {
          const updatedMessages = [...prev];
          if (updatedMessages[messageIndex]) {
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              content: fullText,
              isTyping: false,
              fullContent: fullText
            };
          }
          return updatedMessages;
        });
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }
      }
    };

    typingIntervalRef.current = setInterval(typeNextCharacter, 1000 / typingSpeed);
  };

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

    // If no conversation exists, create one first
    if (!conversationId) {
      console.log('🔄 No conversation exists, creating one...');
      await handleNewConversation();
      // Wait a bit for the conversation to be created
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const userMessage = inputMessage;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');

    await handleSendMessage(userMessage);
    // Assistant reply will come via subscription
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputMessage.trim() && !isWaitingForResponse) {
        handleSubmit(e as React.FormEvent);
      }
    }
  };

  const handleSelectConversation = async (selectedConversationId: string) => {
    // If empty string, clear the conversation
    if (!selectedConversationId) {
      setConversationId(null);
      setMessages([]);
      return;
    }
    
    setConversationId(selectedConversationId);
    setMessages([]); // Clear current messages
    
    // Load conversation data and messages
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
        console.log('✅ Test mode: Creating mock conversation that needs naming:', mockConversationId);
        setConversationId(mockConversationId);
        setNewConversationId(mockConversationId); // Mark as needing a name
        setMessages([]);
        
        // Trigger a refresh of the conversation list
        setConversationListKey(prev => prev + 1);
        return;
      }

      // Get current user for participants
      const currentUserId = userAttributes?.sub || userAttributes?.email || 'anonymous';
      
      console.log('Creating new conversation with user:', currentUserId);
      
      const { data: newConversation } = await dataClient.models.Conversation.create({
        title: '', // Start with empty title to force naming
        participants: [currentUserId] // Add current user to participants
        // createdAt and updatedAt are handled automatically by Amplify
      });
      
      if (newConversation) {
        setConversationId(newConversation.id);
        setNewConversationId(newConversation.id); // Mark as needing a name
        setMessages([]);
        console.log('✅ Created new conversation that needs naming:', newConversation.id);
        
        // Trigger a refresh of the conversation list
        setConversationListKey(prev => prev + 1);
      } else {
        console.error('❌ Failed to create conversation: No data returned');
      }
    } catch (error) {
      console.error('❌ Error creating new conversation:', error);
      // Don't throw the error to prevent breaking the UI
    }
  };

  const handleDeleteConversation = async (conversationIdToDelete: string) => {
    try {
      console.log('🗑️ Deleting conversation:', conversationIdToDelete);
      
      // For development testing, just clear from local state
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
        console.log('✅ Test mode: Removing conversation from local state');
        
        // If this was the current conversation, clear it
        if (conversationIdToDelete === conversationId) {
          setConversationId(null);
          setMessages([]);
        }
        
        // Clear new conversation state
        if (conversationIdToDelete === newConversationId) {
          setNewConversationId(null);
        }
        
        // Trigger a refresh of the conversation list
        setConversationListKey(prev => prev + 1);
        return;
      }

      // Delete from database
      await dataClient.models.Conversation.delete({ id: conversationIdToDelete });
      
      // If this was the current conversation, clear it
      if (conversationIdToDelete === conversationId) {
        setConversationId(null);
        setMessages([]);
      }
      
      // Clear new conversation state
      if (conversationIdToDelete === newConversationId) {
        setNewConversationId(null);
      }
      
      // Trigger a refresh of the conversation list
      setConversationListKey(prev => prev + 1);
      
      console.log('✅ Deleted conversation:', conversationIdToDelete);
    } catch (error) {
      console.error('❌ Error deleting conversation:', error);
    }
  };

  const handleConversationNamed = (conversationId: string) => {
    console.log('✅ Conversation successfully named:', conversationId);
    // Clear the new conversation state since it's now properly named
    if (conversationId === newConversationId) {
      setNewConversationId(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };



  // Clear newConversationId when a conversation is successfully named
  useEffect(() => {
    if (newConversationId && conversationId === newConversationId) {
      // This effect can be used to clear the newConversationId state
      // when we detect the conversation has been properly named
    }
  }, [newConversationId, conversationId]);


  return (
    <div className="flex h-screen bg-gradient-to-br from-brand-bg-primary via-brand-bg-secondary to-brand-bg-tertiary overflow-hidden relative">
      {/* Fixed Hamburger Menu Button - stays in corner */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed top-4 left-4 z-50 p-3 rounded-xl glass-hover text-brand-text-muted hover:text-brand-text-primary 
        transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/50 shadow-glass"
        aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <div className="w-6 h-6 flex flex-col justify-center items-center">
          <span className={`block h-0.5 w-6 bg-current transition-all duration-300 ease-out ${
            isSidebarOpen ? 'rotate-45 translate-y-1' : '-translate-y-0.5'
          }`}></span>
          <span className={`block h-0.5 w-6 bg-current transition-all duration-300 ease-out ${
            isSidebarOpen ? 'opacity-0' : 'opacity-100'
          }`}></span>
          <span className={`block h-0.5 w-6 bg-current transition-all duration-300 ease-out ${
            isSidebarOpen ? '-rotate-45 -translate-y-1' : 'translate-y-0.5'
          }`}></span>
        </div>
      </button>

      {/* Enhanced Sidebar with glass morphism - now push style */}
      <aside
        className={`
          h-full flex-shrink-0 transform transition-all duration-300 ease-in-out z-40
          ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full'}
        `}
        aria-label="Conversation list sidebar"
        role="complementary"
      >
        <div className={`flex flex-col h-full glass backdrop-blur-xl border-r border-brand-surface-border shadow-glass-lg w-80 transition-opacity duration-300 ${
          isSidebarOpen ? 'opacity-100' : 'opacity-0'
        }`}>
          {/* Sidebar Header with enhanced styling */}
          <div className="flex items-center justify-between p-6 pt-20 border-b border-brand-surface-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center shadow-glow-sm animate-float">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-brand-text-primary to-brand-text-accent bg-clip-text text-transparent">
                Brain in Cup
              </h1>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg text-brand-text-muted hover:text-brand-text-primary transition-colors duration-200 hover:bg-brand-surface-hover/20"
              title="Sign out"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>

          {/* Conversation List with enhanced styling */}
          <nav className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-brand-surface-tertiary" aria-label="Conversations">
            <ConversationList 
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onDeleteConversation={handleDeleteConversation}
              onConversationNamed={handleConversationNamed}
              selectedConversationId={conversationId}
              refreshKey={conversationListKey}
              newConversationId={newConversationId}
            />
          </nav>
        </div>
      </aside>

      {/* Main Content Area with improved layout */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Screen reader live region for message updates */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {isWaitingForResponse && 'AI is thinking...'}
          {messages.length > 0 && `Conversation has ${messages.length} messages`}
        </div>



        {/* Enhanced Chat Area with glass morphism design */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages with improved styling and animations */}
          <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-thumb-brand-surface-tertiary">
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.length === 0 && !isLoading && conversationId && (
                <div className="flex justify-center items-center h-full min-h-[200px]">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-full 
                    flex items-center justify-center shadow-lg">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-slate-300 text-lg">
                      Start your conversation with Brain in Cup
                    </p>
                    <p className="text-slate-500 text-sm mt-2">
                      Ask anything - I'm here to help!
                    </p>
                  </div>
                </div>
              )}
              
              {isLoading && (
                <div className="flex justify-center items-center h-full min-h-[200px]">
                  <div className="text-slate-400 flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                    Loading...
                  </div>
                </div>
              )}
              
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-glow-sm animate-float">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-lg backdrop-blur-sm
                    ${message.role === 'user' 
                  ? 'bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary text-white shadow-glow-sm' 
                  : 'glass text-brand-text-primary border border-brand-surface-border'
                }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                      {message.isTyping && (
                        <span className="inline-block w-2 h-5 bg-violet-400 ml-1 animate-pulse"></span>
                      )}
                    </p>
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl glass flex items-center justify-center flex-shrink-0 mt-1 border border-brand-surface-border">
                      <svg className="w-4 h-4 text-brand-text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
              
              {isWaitingForResponse && (
                <div className="flex gap-4 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-glow-sm animate-pulse-glow">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div className="glass text-brand-text-primary border border-brand-surface-border rounded-2xl px-4 py-3 shadow-glass backdrop-blur-lg">
                    <div className="flex items-center gap-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse"></div>
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-150"></div>
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-300"></div>
                      </div>
                      <span className="text-sm text-brand-text-muted">Brain is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Enhanced Debug info - now toggleable */}
              {showDebugInfo && (
                <div className="mt-6 glass rounded-2xl p-4 animate-fade-in">
                  <h3 className="text-sm font-medium text-brand-text-primary mb-2">Debug Information</h3>
                  <div className="text-xs text-brand-text-muted space-y-1">
                    <p>Conversation ID: {conversationId || 'None'}</p>
                    <p>User: {userAttributes?.sub || 'Unknown'}</p>
                    <p>Waiting for response: {isWaitingForResponse ? 'Yes' : 'No'}</p>
                    <p>Messages count: {messages.length}</p>
                  </div>
                </div>
              )}
              
              {/* Invisible element to scroll to */}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Enhanced Input Area with glass morphism */}
          <div className="border-t border-brand-surface-border glass backdrop-blur-xl p-6">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSubmit} className="flex gap-4 items-end">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={conversationId ? 'Message Brain in Cup...' : 'Start typing to begin your conversation...'}
                    className="w-full min-h-[52px] max-h-32 py-4 px-5 rounded-2xl resize-none
                    glass border border-brand-surface-border text-brand-text-primary placeholder-brand-text-muted
                    focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/50 focus:border-brand-accent-primary/50
                    transition-all duration-200 backdrop-blur-lg text-base
                    hover:border-brand-surface-hover"
                    disabled={isWaitingForResponse}
                    rows={1}
                    style={{
                      height: 'auto',
                      minHeight: '52px'
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                    }}
                  />
                  <div className="absolute bottom-4 right-5 text-xs text-brand-text-muted">
                    Enter to send • Shift+Enter for new line
                  </div>
                </div>
                <button
                  type="submit"
                  className={`p-4 rounded-2xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/50 transform
                  ${!inputMessage.trim() || isWaitingForResponse
      ? 'glass text-brand-text-muted cursor-not-allowed opacity-50' 
      : 'bg-gradient-mesh text-white shadow-glow hover:shadow-glow-sm hover:scale-105 active:scale-95 floating-action'
    }`}
                  disabled={!inputMessage.trim() || isWaitingForResponse}
                >
                  {isWaitingForResponse ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </form>
              <div className="mt-3 text-xs text-brand-text-muted text-center">
                Press Ctrl+K to focus • Ctrl+D for debug • ESC to close sidebar
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Footer with glass morphism */}
        <div className="glass backdrop-blur-xl border-t border-brand-surface-border px-6 py-3">
          <div className="max-w-4xl mx-auto text-center text-xs text-brand-text-muted">
            <Footer />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
