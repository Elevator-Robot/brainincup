import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createScrollBounce } from '../utils/scrollBounce';

const BOTTOM_TOLERANCE = 2;

/** Follow content growth only while the reader is at the bottom of the chat. */
export function useChatScroll(conversationId: string | null, isDesktop: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const scrollingUp = useRef(false);
  const previousTop = useRef(0);
  const previousConversation = useRef<string | null | undefined>(undefined);
  const readingAnchor = useRef<{ index: number; fraction: number; top: number } | null>(null);
  const bounceRef = useRef<ReturnType<typeof createScrollBounce> | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToLatest = useCallback(() => {
    pinned.current = true;
    scrollingUp.current = false;
    setIsAtBottom(true);
    bounceRef.current?.reset();
    const scroll = scrollRef.current;
    if (scroll) {
      scroll.scrollTop = scroll.scrollHeight;
      previousTop.current = scroll.scrollTop;
    }
  }, []);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    let frame = 0;
    let viewportWidth = window.innerWidth;
    let scrollWidth = scroll.clientWidth;
    let scrollHeight = scroll.clientHeight;
    let touch: { x: number; y: number } | null = null;
    const bounce = createScrollBounce(scroll);
    bounceRef.current = bounce;
    const layoutChanged = () => window.innerWidth !== viewportWidth
      || scroll.clientWidth !== scrollWidth || scroll.clientHeight !== scrollHeight;
    const captureReadingAnchor = () => {
      // Resize can dispatch a native scroll before React swaps the layout.
      // Those coordinates describe the transient reflow, not a reader gesture.
      if (layoutChanged()) return;
      if (pinned.current) { readingAnchor.current = null; return; }
      const rows = Array.from(content.querySelectorAll<HTMLElement>('[data-message-role]'));
      const viewportTop = scroll.getBoundingClientRect().top;
      const index = rows.findIndex(row => row.getBoundingClientRect().bottom > viewportTop);
      const bounds = rows[index]?.getBoundingClientRect();
      readingAnchor.current = {
        index, top: scroll.scrollTop,
        fraction: bounds?.height ? (viewportTop - bounds.top) / bounds.height : 0,
      };
    };
    // A width breakpoint remounts the layout, not the conversation. Keep the
    // reader's visible message through reflow instead of jumping to the end.
    const restoreReadingAnchor = () => {
      const anchor = readingAnchor.current;
      if (!anchor) return;
      const row = content.querySelectorAll<HTMLElement>('[data-message-role]')[anchor.index];
      scroll.scrollTop = row
        ? scroll.scrollTop + row.getBoundingClientRect().top - scroll.getBoundingClientRect().top + row.getBoundingClientRect().height * anchor.fraction
        : anchor.top;
      previousTop.current = scroll.scrollTop;
    };
    if (previousConversation.current === conversationId && !pinned.current && readingAnchor.current) {
      restoreReadingAnchor();
    } else {
      scrollToLatest();
    }
    previousConversation.current = conversationId;

    const setPinned = (value: boolean) => {
      if (pinned.current === value) return;
      pinned.current = value;
      setIsAtBottom(value);
    };
    const releasePin = () => {
      if (scroll.scrollHeight - scroll.clientHeight <= BOTTOM_TOLERANCE) return;
      scrollingUp.current = true;
      setPinned(false);
    };
    const isNestedControl = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      const control = target.closest('textarea, input, select, [contenteditable="true"], .overflow-y-auto, .overflow-auto');
      return control !== null && control !== scroll && scroll.contains(control);
    };
    const edgePull = (delta: number, hold = false) => {
      const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      if (max <= BOTTOM_TOLERANCE) return;
      if ((delta < 0 && scroll.scrollTop <= 0) || (delta > 0 && max - scroll.scrollTop <= BOTTOM_TOLERANCE)) {
        bounce.pull(-delta, hold);
      } else {
        bounce.release();
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX) || isNestedControl(event.target)) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1);
      if (delta < 0) releasePin();
      else scrollingUp.current = false;
      edgePull(delta);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || isNestedControl(event.target)) { touch = null; bounce.release(); return; }
      touch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1) { touch = null; bounce.release(); return; }
      const next = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      const delta = touch.y - next.y;
      const horizontal = touch.x - next.x;
      touch = next;
      if (Math.abs(delta) <= Math.abs(horizontal)) return;
      if (delta < 0) releasePin();
      else scrollingUp.current = false;
      edgePull(delta, true);
    };
    const onTouchEnd = () => { touch = null; bounce.release(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isNestedControl(event.target) || event.altKey || event.metaKey) return;
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) releasePin();
      else if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) scrollingUp.current = false;
    };
    const onScroll = () => {
      // Native reflow/keyboard clamping is not a reader scrolling away from
      // the latest message. Let the resize observer settle that geometry first.
      if (layoutChanged()) return;
      const top = Math.max(0, scroll.scrollTop);
      const movement = top - previousTop.current;
      previousTop.current = top;
      const distance = scroll.scrollHeight - scroll.clientHeight - top;
      if (scrollingUp.current && movement <= 0) { captureReadingAnchor(); return; }
      if (distance <= BOTTOM_TOLERANCE) {
        scrollingUp.current = false;
        setPinned(true);
      } else if (Math.abs(movement) > .1) {
        setPinned(false);
      }
      captureReadingAnchor();
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (pinned.current) {
          scroll.scrollTop = scroll.scrollHeight;
          previousTop.current = scroll.scrollTop;
        } else if (viewportWidth !== window.innerWidth || scrollWidth !== scroll.clientWidth) {
          restoreReadingAnchor();
        }
        viewportWidth = window.innerWidth;
        scrollWidth = scroll.clientWidth;
        scrollHeight = scroll.clientHeight;
        previousTop.current = scroll.scrollTop;
      });
    });
    observer.observe(content);
    observer.observe(scroll);
    scroll.addEventListener('scroll', onScroll, { passive: true });
    scroll.addEventListener('wheel', onWheel, { passive: true });
    scroll.addEventListener('touchstart', onTouchStart, { passive: true });
    scroll.addEventListener('touchmove', onTouchMove, { passive: true });
    scroll.addEventListener('touchend', onTouchEnd, { passive: true });
    scroll.addEventListener('touchcancel', onTouchEnd, { passive: true });
    scroll.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      bounce.destroy();
      bounceRef.current = null;
      scroll.removeEventListener('scroll', onScroll);
      scroll.removeEventListener('wheel', onWheel);
      scroll.removeEventListener('touchstart', onTouchStart);
      scroll.removeEventListener('touchmove', onTouchMove);
      scroll.removeEventListener('touchend', onTouchEnd);
      scroll.removeEventListener('touchcancel', onTouchEnd);
      scroll.removeEventListener('keydown', onKeyDown);
    };
  }, [conversationId, isDesktop, scrollToLatest]);

  return { scrollRef, contentRef, isAtBottom, scrollToLatest };
}
