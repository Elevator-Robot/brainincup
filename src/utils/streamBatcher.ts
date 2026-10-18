import type { AguiEvent } from './aguiStream';

const deltaTypes = new Set(['TEXT_MESSAGE_CONTENT', 'REASONING_MESSAGE_CONTENT', 'TOOL_CALL_ARGS']);

/** Coalesce adjacent token deltas without delaying control events or reordering tools. */
export function createStreamBatcher(onEvent: (event: AguiEvent) => void) {
  let pending: AguiEvent | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const event = pending;
    pending = undefined;
    if (event) onEvent(event);
  };
  const push = (event: AguiEvent) => {
    if (!deltaTypes.has(event.type) || typeof event.delta !== 'string') {
      flush();
      onEvent(event);
      return;
    }
    if (pending && (pending.type !== event.type || pending.messageId !== event.messageId || pending.toolCallId !== event.toolCallId)) flush();
    pending = pending ? { ...pending, delta: `${pending.delta}${event.delta}` } : { ...event };
    timer ??= setTimeout(flush, 32);
  };
  return { push, flush };
}
