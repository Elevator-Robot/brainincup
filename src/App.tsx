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
      
      console.log('Creating new conversation with user:', currentUserId);
      
      const { data: newConversation } = await dataClient.models.Conversation.create({
        title: 'New Conversation',
        participants: [currentUserId] // Add current user to participants
        // createdAt and updatedAt are handled automatically by Amplify
      });
      
      if (newConversation) {
        setConversationId(newConversation.id);
        setMessages([]);
        console.log('✅ Created new conversation:', newConversation.id);
        
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



  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
      {/* Skip to content link for screen readers */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 
        focus:z-50 focus:px-4 focus:py-2 focus:bg-violet-600 focus:text-white 
        focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50"
      >
        Skip to main content
      </a>
      
      {/* Push-Content Sidebar */}
      <aside
        className={`
          flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden
          ${isSidebarOpen ? 'w-80' : 'w-0'}
        `}
        aria-label="Conversation list sidebar"
      >
        <div className="flex flex-col h-full bg-slate-900/90 backdrop-blur-xl border-r border-slate-700/50 shadow-2xl">
          {/* Sidebar Header with improved spacing */}
          <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
            <h1 className="text-xl font-semibold text-white">Brain in Cup</h1>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 
              transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Conversation List with improved styling */}
          <nav className="flex-1 overflow-y-auto" aria-label="Conversations">
            <ConversationList 
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              selectedConversationId={conversationId}
              refreshKey={conversationListKey}
            />
          </nav>
        </div>
      </aside>

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Screen reader live region for message updates */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {isWaitingForResponse && 'AI is thinking...'}
          {messages.length > 0 && `Conversation has ${messages.length} messages`}
        </div>
        {/* Improved Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 
              transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              aria-label="Open sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {conversationId ? (
              <h2 className="text-lg font-medium text-white truncate">
                Conversation
              </h2>
            ) : (
              <h2 className="text-lg font-medium text-white truncate">
                Brain in Cup
              </h2>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {/* Debug toggle button */}
            <button
              onClick={() => setShowDebugInfo(!showDebugInfo)}
              className="px-3 py-1.5 text-xs rounded-md bg-slate-800/50 text-slate-300 hover:text-white 
              hover:bg-slate-700/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              title="Toggle debug information"
              aria-label="Toggle debug information"
              aria-pressed={showDebugInfo}
            >
              Debug
            </button>
            
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
              className="px-4 py-2 text-sm text-slate-300 hover:text-white 
              transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 rounded-lg"
              aria-label="Sign out of account"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Chat Area - Always show chat interface */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages with improved spacing and alignment */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.length === 0 && !isLoading && conversationId && (
                <div className="flex justify-center items-center h-full min-h-[200px]">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-full 
                    flex items-center justify-center shadow-lg">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
                    <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
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
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 
                    flex items-center justify-center flex-shrink-0 mt-1" aria-label="AI Assistant">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-lg backdrop-blur-sm
                    ${message.role === 'user' 
                  ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white' 
                  : 'bg-slate-800/60 text-slate-100 border border-slate-700/50'
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
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 mt-1" aria-label="User">
                      <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
              
              {isWaitingForResponse && (
                <div className="flex gap-4 justify-start">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 
                  flex items-center justify-center flex-shrink-0 mt-1" aria-label="AI Assistant">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="bg-slate-800/60 text-slate-100 border border-slate-700/50 rounded-2xl px-4 py-3 shadow-lg backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" aria-hidden="true"></div>
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse delay-150" aria-hidden="true"></div>
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse delay-300" aria-hidden="true"></div>
                      </div>
                      <span className="text-sm text-slate-400">Brain is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Debug info - now toggleable */}
              {showDebugInfo && (
                <div className="mt-6 p-4 bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50">
                  <h3 className="text-sm font-medium text-slate-300 mb-2">Debug Information</h3>
                  <div className="text-xs text-slate-400 space-y-1">
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

          {/* Input Area - Always show input */}
          <div className="border-t border-slate-700/50 bg-slate-900/50 backdrop-blur-xl p-6">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSubmit} className="flex gap-3 items-end">
                <div className="flex-1 relative">
                  <label htmlFor="message-input" className="sr-only">
                    {conversationId ? 'Message Brain in Cup' : 'Start your conversation'}
                  </label>
                  <textarea
                    ref={inputRef}
                    id="message-input"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={conversationId ? 'Message Brain in Cup...' : 'Start typing to begin your conversation...'}
                    className="w-full min-h-[44px] max-h-32 py-3 px-4 rounded-xl resize-none
                    bg-slate-800/50 border border-slate-700/50 text-white placeholder-slate-400
                    focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50
                    transition-all duration-200 backdrop-blur-sm"
                    disabled={isWaitingForResponse}
                    rows={1}
                    aria-describedby="message-instructions"
                    style={{
                      height: 'auto',
                      minHeight: '44px'
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                    }}
                  />
                  <div id="message-instructions" className="absolute bottom-3 right-4 text-xs text-slate-500">
                    Enter to send • Shift+Enter for new line
                  </div>
                </div>
                <button
                  type="submit"
                  className={`p-3 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50
                  ${!inputMessage.trim() || isWaitingForResponse
      ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed' 
      : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 shadow-lg hover:shadow-violet-500/25'
    }`}
                  disabled={!inputMessage.trim() || isWaitingForResponse}
                  aria-label={isWaitingForResponse ? 'Sending message...' : 'Send message'}
                >
                  {isWaitingForResponse ? (
                    <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </form>
              <div className="mt-2 text-xs text-slate-500 text-center">
                Press Ctrl+K to focus • ESC to close sidebar
              </div>
            </div>
          </div>
        </div>

        {/* Improved Footer */}
        <div className="bg-slate-900/30 backdrop-blur-xl border-t border-slate-700/50 px-6 py-3">
          <div className="max-w-4xl mx-auto text-center text-xs text-slate-500">
            <Footer />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
