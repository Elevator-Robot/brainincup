import type { ReactNode } from 'react';
import type { Message } from '../components/MessageBubble';
import type { ChatAction } from '../utils/chatActions';

/** Content capabilities, not mode identifiers. New experiences supply data to
 * the same composer and transcript rather than creating presentation forks. */
export interface ChatComposerConfiguration {
  actions: ChatAction[];
  quickActions: ChatAction[];
  inputLabel: string;
  suggestCompletion: (draft: string) => string;
}

/** Return undefined to use the standard message; null can hide an extension.
 * Domain-specific controls live in adapters, never in the common renderer. */
export type RenderMessageExtension = (message: Message) => ReactNode | undefined;
