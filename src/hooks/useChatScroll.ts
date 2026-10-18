import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Follow content growth only while the reader is at the bottom of the chat. */
export function useChatScroll(conversationId: string | null, isDesktop: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToLatest = useCallback(() => {
    pinned.current = true;
    setIsAtBottom(true);
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    let frame = 0;
    scrollToLatest();

    const onScroll = () => {
      const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
      pinned.current = atBottom;
      setIsAtBottom(atBottom);
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (pinned.current) scroll.scrollTop = scroll.scrollHeight;
      });
    });
    observer.observe(content);
    observer.observe(scroll);
    scroll.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroll.removeEventListener('scroll', onScroll);
    };
  }, [conversationId, isDesktop, scrollToLatest]);

  return { scrollRef, contentRef, isAtBottom, scrollToLatest };
}
