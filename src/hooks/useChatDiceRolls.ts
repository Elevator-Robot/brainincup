import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Message } from '../components/MessageBubble';
import { DICE_ROLL_DURATION_MS, isDiceRollExpired, parseDiceRollRequest, rollD20, type ChatDiceRoll, type DiceRollRequest } from '../utils/diceRolls';
import { useMediaQuery } from './useMediaQuery';

interface ChatDiceRollOptions {
  conversationId: string | null;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  busy: boolean;
  onSubmit: (request: DiceRollRequest, value: number) => Promise<void>;
}

/** Requested checks are chat entries. Receiving a request never rolls the die. */
export function useChatDiceRolls({ conversationId, messages, setMessages, busy, onSubmit }: ChatDiceRollOptions) {
  const [pending, setPending] = useState<{ conversationId: string; request: DiceRollRequest } | null>(null);
  const current = useRef({ conversationId, messages, busy, onSubmit });
  current.current = { conversationId, messages, busy, onSubmit };
  const inFlight = useRef(new Set<string>());
  const timers = useRef(new Map<ReturnType<typeof setTimeout>, () => void>());
  const generation = useRef(0);
  const confirmedRequest = useRef<string | null>(null);
  const closedRequests = useRef(new Set<string>());
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    setPending(null);
    confirmedRequest.current = null;
    closedRequests.current.clear();
    const activeTimers = timers.current;
    const activeRolls = inFlight.current;
    return () => {
      generation.current += 1;
      activeTimers.forEach((resolve, timer) => { clearTimeout(timer); resolve(); });
      activeTimers.clear();
      activeRolls.clear();
    };
  }, [conversationId]);

  const requestRoll = useCallback((value: unknown, forConversation?: string | null) => {
    const request = parseDiceRollRequest(value);
    const id = current.current.conversationId;
    if (!id || (forConversation && forConversation !== id) || !request || isDiceRollExpired(request) || closedRequests.current.has(request.requestId)) return;
    setPending(previous => previous?.conversationId === id && previous.request.requestId === request.requestId
      ? { conversationId: id, request: { ...previous.request, ...request } }
      : { conversationId: id, request });
  }, []);

  const syncRequestedRoll = useCallback((value: unknown, forConversation: string) => {
    if (current.current.conversationId !== forConversation) return;
    const request = parseDiceRollRequest(value);
    if (request) {
      confirmedRequest.current = request.requestId;
      requestRoll(request, forConversation);
    } else if (confirmedRequest.current) {
      const closed = confirmedRequest.current;
      closedRequests.current.add(closed);
      confirmedRequest.current = null;
      setPending(previous => previous?.request.requestId === closed ? null : previous);
    }
  }, [requestRoll]);

  useEffect(() => {
    if (!pending?.request.expiresAt) return;
    const timer = setTimeout(() => setPending(null), Math.max(0, Date.parse(pending.request.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [pending]);

  // Wait for narration to finish: stream handlers append to the active text message.
  useEffect(() => {
    if (!pending || pending.conversationId !== conversationId || busy) return;
    setMessages(previous => {
      if (previous.some(message => message.diceRoll?.requestId === pending.request.requestId)) return previous;
      return [...previous, {
        role: 'assistant', content: '', messageId: `dice:${pending.request.requestId}`,
        diceRoll: { ...pending.request, phase: 'pending' },
      }];
    });
  }, [pending, conversationId, busy, setMessages]);

  // A refresh preserves the selected value, but never starts a second roll.
  useEffect(() => {
    if (!messages.some(message => message.diceRoll && ['rolling', 'submitting'].includes(message.diceRoll.phase) && !inFlight.current.has(message.diceRoll.requestId))) return;
    setMessages(previous => previous.map(message => message.diceRoll && ['rolling', 'submitting'].includes(message.diceRoll.phase) && !inFlight.current.has(message.diceRoll.requestId)
      ? { ...message, diceRoll: { ...message.diceRoll, phase: 'error' } } : message));
  }, [messages, setMessages]);

  const roll = useCallback(async (requestId: string) => {
    const state = current.current;
    if (!state.conversationId || state.busy || pending?.conversationId !== state.conversationId || pending.request.requestId !== requestId || inFlight.current.has(requestId)) return;
    const request = state.messages.find(message => message.diceRoll?.requestId === requestId)?.diceRoll;
    if (!request || !['pending', 'error'].includes(request.phase) || isDiceRollExpired(request)) return;
    inFlight.current.add(requestId);
    const version = generation.current;
    const value = request.value ?? rollD20();
    const duration = request.value !== undefined || reducedMotion ? 0 : DICE_ROLL_DURATION_MS;
    const patch = (update: Partial<ChatDiceRoll>) => {
      if (generation.current !== version || current.current.conversationId !== state.conversationId) return;
      setMessages(previous => previous.map(message => message.diceRoll?.requestId === requestId
        ? { ...message, diceRoll: { ...message.diceRoll, ...update } } : message));
    };
    patch({ phase: duration ? 'rolling' : 'submitting', value, startedAt: Date.now(), duration });
    // Submit once immediately. The animation is presentation, never a second roll.
    const submission = state.onSubmit(request, value).then(() => true, () => false);
    if (duration) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { timers.current.delete(timer); resolve(); }, duration);
      timers.current.set(timer, resolve);
    });
    patch({ phase: 'submitting' });
    const submitted = await submission;
    patch({ phase: submitted ? 'submitted' : 'error' });
    inFlight.current.delete(requestId);
  }, [pending, reducedMotion, setMessages]);

  const activeRequestId = pending?.conversationId === conversationId ? pending.request.requestId : null;
  const hasPendingRoll = messages.some(message => message.diceRoll && (
    ['rolling', 'submitting'].includes(message.diceRoll.phase) ||
    (message.diceRoll.requestId === activeRequestId && !isDiceRollExpired(message.diceRoll) && !['submitted', 'cancelled'].includes(message.diceRoll.phase))
  ));
  return { requestRoll, syncRequestedRoll, roll, activeRequestId, hasPendingRoll };
}
