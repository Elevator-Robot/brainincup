import { useEffect, useState, useRef } from 'react';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import ConversationList from './components/ConversationList';
import BrainIcon from './components/BrainIcon';

const dataClient = generateClient<Schema>();

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isTyping?: boolean;
  fullContent?: string; // Store the complete content when typing
  // Additional AI response data
  sensations?: string[];
  thoughts?: string[];
  memories?: string;
  selfReflection?: string;
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
  const [expandedMessageIndex, setExpandedMessageIndex] = useState<number | null>(null); // Track which message's details are shown
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

  // Auto-scroll to bottom when expanded message details change
  useEffect(() => {
    if (messagesEndRef.current) {
      // Small delay to let the expansion animation complete
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [expandedMessageIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + D toggles debug info (dev only)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        setShowDebugInfo(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
              sensations
              thoughts
              memories
              selfReflection
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
            sensations?: string[];
            thoughts?: string[];
            memories?: string;
            selfReflection?: string;
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
            console.log('Sensations:', brainResponse.sensations);
            console.log('Thoughts:', brainResponse.thoughts);
            console.log('Memories:', brainResponse.memories);
            console.log('Self Reflection:', brainResponse.selfReflection);
            console.log('Current conversation ID:', conversationId);
            console.log('Response conversation ID:', brainResponse.conversationId);
            console.log('Response owner:', brainResponse.owner);
            
            // Check if this response is for our conversation
            if (brainResponse.conversationId === conversationId) {
              console.log('✅ MATCH: Starting typing animation for response:', brainResponse.response);
              console.log('✅ MATCH: Including metadata - sensations:', brainResponse.sensations, 'thoughts:', brainResponse.thoughts);
              
              // Add empty assistant message to start typing animation
              setMessages(prev => {
                const newMessages: Message[] = [...prev, { 
                  role: 'assistant' as const, 
                  content: '',
                  isTyping: true,
                  fullContent: brainResponse.response ?? '',
                  sensations: brainResponse.sensations?.filter((s): s is string => s !== null) || [],
                  thoughts: brainResponse.thoughts?.filter((t): t is string => t !== null) || [],
                  memories: brainResponse.memories || '',
                  selfReflection: brainResponse.selfReflection || '',
                }];
                
                console.log('Message being added:', newMessages[newMessages.length - 1]);
                
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
    let loggedOnce = false; // Only log once to avoid spam

    const typeNextCharacter = () => {
      if (currentIndex < fullText.length) {
        setMessages(prev => {
          const updatedMessages = [...prev];
          if (updatedMessages[messageIndex]) {
            // Log once to see what we're preserving
            if (!loggedOnce && currentIndex === 0) {
              console.log('Typing animation - preserving fields:', {
                sensations: updatedMessages[messageIndex].sensations,
                thoughts: updatedMessages[messageIndex].thoughts,
                memories: updatedMessages[messageIndex].memories,
                selfReflection: updatedMessages[messageIndex].selfReflection,
              });
              loggedOnce = true;
            }
            
            // Preserve all existing fields when updating content
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              content: fullText.substring(0, currentIndex + 1),
              isTyping: true,
              fullContent: fullText,
              // Keep the additional fields from the original message
              sensations: updatedMessages[messageIndex].sensations,
              thoughts: updatedMessages[messageIndex].thoughts,
              memories: updatedMessages[messageIndex].memories,
              selfReflection: updatedMessages[messageIndex].selfReflection,
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
            console.log('Typing animation complete - final message:', {
              sensations: updatedMessages[messageIndex].sensations,
              thoughts: updatedMessages[messageIndex].thoughts,
              memories: updatedMessages[messageIndex].memories,
              selfReflection: updatedMessages[messageIndex].selfReflection,
            });
            
            // Preserve all existing fields when marking typing complete
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              content: fullText,
              isTyping: false,
              fullContent: fullText,
              // Keep the additional fields from the original message
              sensations: updatedMessages[messageIndex].sensations,
              thoughts: updatedMessages[messageIndex].thoughts,
              memories: updatedMessages[messageIndex].memories,
              selfReflection: updatedMessages[messageIndex].selfReflection,
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

    // Don't allow sending messages until the conversation is named
    if (newConversationId && conversationId === newConversationId) {
      console.log('⚠️ Cannot send message - conversation needs to be named first');
      // Visual feedback is already shown in the UI, no need for alert
      return;
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
    // Don't allow switching conversations if there's an unnamed conversation
    if (newConversationId && conversationId === newConversationId) {
      console.log('⚠️ Cannot switch - current conversation needs to be named first');
      // Visual feedback is already shown, just prevent the switch
      return;
    }
    
    // If empty string, clear the conversation
    if (!selectedConversationId) {
      setConversationId(null);
      setMessages([]);
      setIsWaitingForResponse(false);
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
      
      // Check if there's a pending message (message without response)
      let hasPendingMessage = false;
      
      // For each message, add it and its corresponding response
      sortedMessages.forEach(msg => {
        timeline.push({ role: 'user', content: msg.content || '' });
        
        // Find corresponding brain response
        const response = brainResponses?.find(br => br.messageId === msg.id);
        if (response?.response) {
          timeline.push({ 
            role: 'assistant', 
            content: response.response,
            sensations: response.sensations?.filter((s): s is string => s !== null) || [],
            thoughts: response.thoughts?.filter((t): t is string => t !== null) || [],
            memories: response.memories || '',
            selfReflection: response.selfReflection || '',
          });
        } else {
          // This message has no response yet - mark as pending
          hasPendingMessage = true;
          console.log('⏳ Found pending message:', msg.id);
        }
      });
      
      // Set waiting state based on whether there's a pending message
      if (hasPendingMessage) {
        console.log('🔒 Blocking input - pending message detected after load');
        setIsWaitingForResponse(true);
      } else {
        setIsWaitingForResponse(false);
      }
      
      setMessages(timeline);
    } catch (error) {
      console.error('Error loading conversation messages:', error);
      setIsWaitingForResponse(false);
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

  // Clear newConversationId when a conversation is successfully named
  useEffect(() => {
    if (newConversationId && conversationId === newConversationId) {
      // This effect can be used to clear the newConversationId state
      // when we detect the conversation has been properly named
    }
  }, [newConversationId, conversationId]);

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-brand-bg-primary via-brand-bg-secondary to-brand-bg-tertiary overflow-hidden relative">
      {/* Mobile: Top Navigation Bar with Menu Button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 glass backdrop-blur-xl border-b border-brand-surface-border">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-xl glass-hover text-brand-text-muted hover:text-brand-text-primary 
            transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/50"
            aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
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
          
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-mesh flex items-center justify-center shadow-glow-sm">
              <BrainIcon className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-brand-text-primary to-brand-text-accent bg-clip-text text-transparent">
              Brain in Cup
            </h1>
          </div>
          
          {/* Spacer to keep title centered */}
          <div className="w-10 h-10"></div>
        </div>
      </div>

      {/* Mobile: Full-screen Overlay Menu */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition-all duration-300 ${
          isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            isSidebarOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsSidebarOpen(false)}
        />
        
        {/* Mobile Menu Panel */}
        <div
          className={`absolute top-0 left-0 right-0 bottom-0 glass backdrop-blur-2xl transform transition-all duration-300 ease-out ${
            isSidebarOpen ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
          }`}
        >
          <div className="flex flex-col h-full">
            {/* Mobile Menu Header */}
            <div className="flex items-center justify-between p-4 border-b border-brand-surface-border">
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 rounded-xl glass-hover text-brand-text-muted hover:text-brand-text-primary transition-all duration-200"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 className="text-xl font-bold bg-gradient-to-r from-brand-text-primary to-brand-text-accent bg-clip-text text-transparent">
                Conversations
              </h2>
              <div className="w-10 h-10"></div> {/* Spacer for centering */}
            </div>

            {/* Mobile Menu Content */}
            <nav className="flex-1 overflow-y-auto" aria-label="Conversations">
              <ConversationList 
                onSelectConversation={(id) => {
                  handleSelectConversation(id);
                  setIsSidebarOpen(false); // Close menu after selection on mobile
                }}
                onNewConversation={() => {
                  handleNewConversation();
                  setIsSidebarOpen(false); // Close menu after creating new conversation
                }}
                onDeleteConversation={handleDeleteConversation}
                onConversationNamed={handleConversationNamed}
                selectedConversationId={conversationId}
                refreshKey={conversationListKey}
                newConversationId={newConversationId}
              />
            </nav>

            {/* Mobile Menu Footer with Sign Out */}
            <div className="border-t border-brand-surface-border p-4">
              <button
                onClick={() => {
                  handleSignOut();
                  setIsSidebarOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl glass-hover
                text-brand-text-muted hover:text-brand-text-primary transition-all duration-200
                hover:bg-brand-surface-hover/20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: Sidebar with Hamburger Button */}
      <div className="hidden lg:flex h-full">
        {/* Desktop Hamburger Button */}
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

        {/* Desktop Sidebar */}
        <aside
          className={`h-full flex-shrink-0 transform transition-all duration-300 ease-in-out z-40
            ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full'}`}
          aria-label="Conversation list sidebar"
          role="complementary"
        >
          <div className={`flex flex-col h-full glass backdrop-blur-xl border-r border-brand-surface-border shadow-glass-lg w-80 transition-opacity duration-300 ${
            isSidebarOpen ? 'opacity-100' : 'opacity-0'
          }`}>
            {/* Desktop Sidebar Header */}
            <div className="flex items-center justify-between p-6 pt-20 border-b border-brand-surface-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center shadow-glow-sm animate-float">
                  <BrainIcon className="w-5 h-5 text-white" />
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

            {/* Desktop Conversation List */}
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

        {/* Main Content Area - Desktop */}
        <main 
          className="flex-1 flex flex-col min-w-0 overflow-hidden"
          onClick={() => {
            // Close sidebar when clicking in main area on desktop
            if (isSidebarOpen) {
              setIsSidebarOpen(false);
            }
          }}
        >
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
          <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-thumb-brand-surface-tertiary flex flex-col-reverse">
            <div className="max-w-4xl mx-auto space-y-6 flex flex-col">
              {/* Invisible element to scroll to - at the bottom in reversed layout */}
              <div ref={messagesEndRef} />
              
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
                      <BrainIcon className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-2 max-w-[85%] sm:max-w-[75%]">
                    <div
                      className={`rounded-2xl px-4 py-3 backdrop-blur-sm
                      transition-all duration-300 hover:scale-[1.02] animate-slide-up
                      ${message.role === 'assistant' ? 'cursor-pointer' : ''}
                      ${message.role === 'user' 
                    ? 'bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary text-white shadow-glow-purple hover:shadow-glow-lg' 
                    : 'glass text-brand-text-primary border border-brand-surface-border shadow-glass-lg hover:shadow-neon-blue'
                  }`}
                      onClick={() => {
                        if (message.role === 'assistant') {
                          setExpandedMessageIndex(expandedMessageIndex === index ? null : index);
                        }
                      }}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap break-words">
                        {message.content}
                        {message.isTyping && (
                          <span className="inline-block w-2 h-5 bg-violet-400 ml-1 animate-pulse"></span>
                        )}
                      </p>
                    </div>
                    
                    {/* Show additional details when expanded */}
                    {message.role === 'assistant' && expandedMessageIndex === index && (
                      <div className="flex flex-wrap gap-2 animate-slide-up">
                        {/* Sensations bubble */}
                        {message.sensations && message.sensations.length > 0 && (
                          <div className="glass rounded-xl px-3 py-2 text-sm border border-purple-500/30 shadow-glow-sm backdrop-blur-lg">
                            <div className="font-semibold text-purple-400 mb-1 flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Sensations
                            </div>
                            <ul className="text-brand-text-muted list-disc list-inside space-y-1">
                              {message.sensations.map((sensation, i) => (
                                <li key={i}>{sensation}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Thoughts bubble */}
                        {message.thoughts && message.thoughts.length > 0 && (
                          <div className="glass rounded-xl px-3 py-2 text-sm border border-blue-500/30 shadow-glow-sm backdrop-blur-lg">
                            <div className="font-semibold text-blue-400 mb-1 flex items-center gap-1">
                              <BrainIcon className="w-4 h-4" />
                              Thoughts
                            </div>
                            <ul className="text-brand-text-muted list-disc list-inside space-y-1">
                              {message.thoughts.map((thought, i) => (
                                <li key={i}>{thought}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Memories bubble */}
                        {message.memories && message.memories.trim() && (
                          <div className="glass rounded-xl px-3 py-2 text-sm border border-green-500/30 shadow-glow-sm backdrop-blur-lg">
                            <div className="font-semibold text-green-400 mb-1 flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              Memories
                            </div>
                            <p className="text-brand-text-muted">{message.memories}</p>
                          </div>
                        )}
                        
                        {/* Self Reflection bubble */}
                        {message.selfReflection && message.selfReflection.trim() && (
                          <div className="glass rounded-xl px-3 py-2 text-sm border border-amber-500/30 shadow-glow-sm backdrop-blur-lg">
                            <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Self Reflection
                            </div>
                            <p className="text-brand-text-muted">{message.selfReflection}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl glass flex items-center justify-center flex-shrink-0 mt-1 border border-brand-surface-border shadow-glass hover:shadow-glow-sm transition-all duration-300">
                      <svg className="w-4 h-4 text-brand-text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
              
              {isWaitingForResponse && (
                <div className="flex gap-4 justify-start animate-slide-up">
                  <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-neon-purple animate-glow-pulse">
                    <BrainIcon className="w-4 h-4 text-white animate-spin-slow" />
                  </div>
                  <div className="glass text-brand-text-primary border border-brand-surface-border rounded-2xl px-4 py-3 shadow-neon-blue backdrop-blur-lg">
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
            </div>
          </div>

          {/* Floating Input Area with enhanced design */}
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              {/* Show message if conversation needs naming */}
              {newConversationId && conversationId === newConversationId && (
                <div className="mb-4 p-4 rounded-2xl bg-brand-accent-primary/10 border border-brand-accent-primary/30 text-center backdrop-blur-xl shadow-lg">
                  <p className="text-sm text-brand-text-primary font-medium">
                    Name your conversation...
                  </p>
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="relative">
                {/* Floating container with premium styling */}
                <div 
                  className="glass border border-brand-surface-border rounded-3xl p-4 backdrop-blur-2xl 
                  transition-all duration-300 hover:shadow-glow-lg hover:border-brand-accent-primary/30 animate-fade-in
                  cursor-text relative overflow-hidden"
                  style={{ boxShadow: 'rgba(0, 0, 0, 0.1) 0px 20px 25px -5px, rgba(0, 0, 0, 0.04) 0px 10px 10px -5px' }}
                  onClick={() => inputRef.current?.focus()}
                >
                  {/* Animated gradient border effect */}
                  <div className="absolute inset-0 rounded-3xl opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{
                      background: 'linear-gradient(45deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1), rgba(240, 147, 251, 0.1))',
                      backgroundSize: '200% 200%',
                      animation: 'shimmer 3s ease infinite'
                    }}
                  />
                  
                  <div className="flex gap-3 items-end relative z-10">
                    <div className="flex-1 relative">
                      <textarea
                        ref={inputRef}
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={(e) => {
                          // Force remove any glow effects on focus
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.outline = 'none';
                          e.currentTarget.style.border = 'none';
                          if (e.currentTarget.parentElement?.parentElement?.parentElement) {
                            const container = e.currentTarget.parentElement.parentElement.parentElement;
                            container.style.boxShadow = 'rgba(0, 0, 0, 0.1) 0px 20px 25px -5px, rgba(0, 0, 0, 0.04) 0px 10px 10px -5px';
                          }
                        }}
                        placeholder={
                          isWaitingForResponse
                            ? 'Waiting for response...'
                            : newConversationId && conversationId === newConversationId
                            ? 'Name your conversation first...'
                            : conversationId 
                            ? 'Message Brain in Cup...' 
                            : 'Start typing to begin your conversation...'
                        }
                        className="w-full min-h-[56px] max-h-32 py-3 px-1 resize-none
                        bg-transparent text-brand-text-primary placeholder-brand-text-muted
                        border-0 focus:border-0
                        focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 
                        transition-all duration-200 text-base
                        disabled:opacity-50 disabled:cursor-not-allowed
                        !outline-none !ring-0 !shadow-none !border-0
                        pointer-events-auto"
                        disabled={isWaitingForResponse || (newConversationId === conversationId)}
                        rows={1}
                        style={{
                          height: 'auto',
                          minHeight: '56px',
                          boxShadow: 'none !important',
                          outline: 'none !important',
                          border: 'none !important',
                          borderWidth: '0 !important'
                        }}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                        }}
                      />
                    </div>
                    <button
                      type="submit"
                      className={`p-4 rounded-2xl transition-all duration-300 focus:outline-none focus:ring-0 transform flex-shrink-0
                      ${!inputMessage.trim() || isWaitingForResponse || (newConversationId === conversationId)
          ? 'glass text-brand-text-muted cursor-not-allowed opacity-40' 
          : 'bg-gradient-mesh text-white shadow-glow-purple hover:shadow-neon-purple hover:scale-110 active:scale-95 animate-glow-pulse'
        }`}
                      disabled={!inputMessage.trim() || isWaitingForResponse || (newConversationId === conversationId)}
                    >
                      {isWaitingForResponse ? (
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-6 h-6 drop-shadow-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        </main>
      </div>

      {/* Mobile: Main Content Area */}
      <main className="lg:hidden flex flex-col h-full pt-16">
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
          <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-brand-surface-tertiary flex flex-col-reverse">
            <div className="max-w-4xl mx-auto space-y-4 flex flex-col">
              {/* Invisible element to scroll to - at the bottom in reversed layout */}
              <div ref={messagesEndRef} />
              
              {messages.length === 0 && !isLoading && conversationId && (
                <div className="flex justify-center items-center h-full min-h-[200px]">
                  <div className="text-center px-4">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-full 
                    flex items-center justify-center shadow-lg">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-slate-300 text-base">
                      Start your conversation
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
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-glow-sm">
                      <BrainIcon className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-2 max-w-[85%]">
                    <div
                      className={`rounded-2xl px-4 py-3 backdrop-blur-sm
                      transition-all duration-300 hover:scale-[1.02] animate-slide-up
                      ${message.role === 'assistant' ? 'cursor-pointer' : ''}
                      ${message.role === 'user' 
                    ? 'bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary text-white shadow-glow-purple' 
                    : 'glass text-brand-text-primary border border-brand-surface-border shadow-glass-lg'
                  }`}
                      onClick={() => {
                        if (message.role === 'assistant') {
                          setExpandedMessageIndex(expandedMessageIndex === index ? null : index);
                        }
                      }}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap break-words text-sm">
                        {message.content}
                        {message.isTyping && (
                          <span className="inline-block w-2 h-5 bg-violet-400 ml-1 animate-pulse"></span>
                        )}
                      </p>
                    </div>
                    
                    {/* Show additional details when expanded */}
                    {message.role === 'assistant' && expandedMessageIndex === index && (
                      <div className="flex flex-wrap gap-2 animate-slide-up">
                        {/* Sensations bubble */}
                        {message.sensations && message.sensations.length > 0 && (
                          <div className="glass rounded-xl px-3 py-2 text-xs border border-purple-500/30 shadow-glow-sm backdrop-blur-lg">
                            <div className="font-semibold text-purple-400 mb-1 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Sensations
                            </div>
                            <ul className="text-brand-text-muted list-disc list-inside space-y-1">
                              {message.sensations.map((sensation, i) => (
                                <li key={i}>{sensation}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Thoughts bubble */}
                        {message.thoughts && message.thoughts.length > 0 && (
                          <div className="glass rounded-xl px-3 py-2 text-xs border border-blue-500/30 shadow-glow-sm backdrop-blur-lg">
                            <div className="font-semibold text-blue-400 mb-1 flex items-center gap-1">
                              <BrainIcon className="w-3 h-3" />
                              Thoughts
                            </div>
                            <ul className="text-brand-text-muted list-disc list-inside space-y-1">
                              {message.thoughts.map((thought, i) => (
                                <li key={i}>{thought}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Memories bubble */}
                        {message.memories && message.memories.trim() && (
                          <div className="glass rounded-xl px-3 py-2 text-xs border border-green-500/30 shadow-glow-sm backdrop-blur-lg">
                            <div className="font-semibold text-green-400 mb-1 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              Memories
                            </div>
                            <p className="text-brand-text-muted">{message.memories}</p>
                          </div>
                        )}
                        
                        {/* Self Reflection bubble */}
                        {message.selfReflection && message.selfReflection.trim() && (
                          <div className="glass rounded-xl px-3 py-2 text-xs border border-amber-500/30 shadow-glow-sm backdrop-blur-lg">
                            <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Self Reflection
                            </div>
                            <p className="text-brand-text-muted">{message.selfReflection}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl glass flex items-center justify-center flex-shrink-0 mt-1 border border-brand-surface-border shadow-glass">
                      <svg className="w-4 h-4 text-brand-text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
              
              {isWaitingForResponse && (
                <div className="flex gap-3 justify-start animate-slide-up">
                  <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-neon-purple animate-glow-pulse">
                    <BrainIcon className="w-4 h-4 text-white animate-spin-slow" />
                  </div>
                  <div className="glass text-brand-text-primary border border-brand-surface-border rounded-2xl px-4 py-3 shadow-neon-blue backdrop-blur-lg">
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
            </div>
          </div>

          {/* Mobile Input Area */}
          <div className="p-4 pb-safe">
            <div className="max-w-4xl mx-auto">
              {/* Show message if conversation needs naming */}
              {newConversationId && conversationId === newConversationId && (
                <div className="mb-3 p-3 rounded-2xl bg-brand-accent-primary/10 border border-brand-accent-primary/30 text-center backdrop-blur-xl">
                  <p className="text-xs text-brand-text-primary font-medium">
                    Name your conversation...
                  </p>
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="relative">
                <div 
                  className="glass border border-brand-surface-border rounded-2xl p-3 backdrop-blur-2xl 
                  transition-all duration-300 hover:shadow-glow-lg hover:border-brand-accent-primary/30"
                  onClick={() => inputRef.current?.focus()}
                >
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <textarea
                        ref={inputRef}
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          isWaitingForResponse
                            ? 'Waiting...'
                            : newConversationId && conversationId === newConversationId
                            ? 'Name conversation first...'
                            : 'Message Brain in Cup...'
                        }
                        className="w-full min-h-[44px] max-h-32 py-2 px-1 resize-none
                        bg-transparent text-brand-text-primary placeholder-brand-text-muted
                        border-0 focus:outline-none focus:ring-0 text-sm
                        disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isWaitingForResponse || (newConversationId === conversationId)}
                        rows={1}
                        style={{ height: 'auto', minHeight: '44px' }}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                        }}
                      />
                    </div>
                    <button
                      type="submit"
                      className={`p-3 rounded-xl transition-all duration-300 focus:outline-none transform flex-shrink-0
                      ${!inputMessage.trim() || isWaitingForResponse || (newConversationId === conversationId)
          ? 'glass text-brand-text-muted cursor-not-allowed opacity-40' 
          : 'bg-gradient-mesh text-white shadow-glow-purple hover:shadow-neon-purple hover:scale-110 active:scale-95'
        }`}
                      disabled={!inputMessage.trim() || isWaitingForResponse || (newConversationId === conversationId)}
                    >
                      {isWaitingForResponse ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;
