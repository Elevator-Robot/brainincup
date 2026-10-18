import { useEffect } from 'react';

const EXCLUDED = 'script, style, noscript, textarea, input, select, option, [contenteditable]:not([contenteditable="false"]), [aria-hidden="true"], [hidden], [data-text-arrival="off"], [data-cosmic-text-layer]';
const TEXT_BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, pre, td, th, label, button, summary, dt, dd, figcaption';
const LIFETIME = 720;

/** Decorative trails for new assistant chat text only; never rewrites markup. */
export default function TextArrivalEffects() {
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const layer = document.createElement('div');
    layer.className = 'cosmic-text-arrival-layer';
    layer.dataset.cosmicTextLayer = '';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    const pending = new Map<HTMLElement, Text>();
    const active = new Map<HTMLElement, { marker: HTMLElement; timer: number; text: Text }>();
    let frame = 0;

    const remove = (owner: HTMLElement) => {
      const trail = active.get(owner);
      if (!trail) return;
      window.clearTimeout(trail.timer);
      trail.marker.remove();
      active.delete(owner);
    };
    const clear = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      pending.clear();
      for (const owner of active.keys()) remove(owner);
    };

    const paint = () => {
      frame = 0;
      const selection = window.getSelection();
      if (motion.matches || document.hidden || (selection && !selection.isCollapsed)) {
        clear();
        return;
      }
      // Batch streaming mutations and cap simultaneous accents on large page loads.
      const updates = [...pending.entries()];
      pending.clear();
      for (const [owner, text] of updates) {
        remove(owner);
        if (!text.isConnected || owner.closest(EXCLUDED)) continue;
        const value = text.data.trimEnd();
        if (!value) continue;
        const range = document.createRange();
        // Keep a surrogate pair intact when the final character is an emoji.
        const last = Array.from(value).pop() ?? '';
        range.setStart(text, value.length - last.length);
        range.setEnd(text, value.length);
        const rects = range.getClientRects();
        const rect = rects[rects.length - 1];
        if (!rect || !rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) continue;
        const hit = document.elementFromPoint?.(
          Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2)),
          Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2)),
        );
        // Don't paint through a clipped scroll panel or over a covering dialog.
        if (hit && !owner.contains(hit)) continue;
        if (active.size >= 12) remove(active.keys().next().value!);
        const marker = document.createElement('span');
        const rtl = getComputedStyle(owner).direction === 'rtl';
        marker.className = 'cosmic-text-arrival-trail';
        marker.dataset.direction = rtl ? 'rtl' : 'ltr';
        marker.style.left = `${rtl ? rect.left : rect.right}px`;
        marker.style.top = `${Math.min(rect.bottom - 2, window.innerHeight - 2)}px`;
        marker.style.width = `${Math.min(30, Math.max(16, rect.height * 1.3))}px`;
        layer.appendChild(marker);
        active.set(owner, { marker, text, timer: window.setTimeout(() => remove(owner), LIFETIME) });
      }
    };

    const queueText = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || !node.data.trim() || parent.closest(EXCLUDED) || !(parent instanceof HTMLElement) || !parent.closest('[data-chat-arrival]')) return;
      const owner = parent.closest<HTMLElement>(TEXT_BLOCK) ?? parent;
      pending.set(owner, node);
    };
    const collect = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        queueText(node as Text);
      } else if (node instanceof HTMLElement && !node.closest(EXCLUDED)) {
        if (!node.closest('[data-chat-arrival]')) {
          node.querySelectorAll('[data-chat-arrival]').forEach(collect);
          return;
        }
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let text: Node | null;
        while ((text = walker.nextNode())) queueText(text as Text);
      }
    };
    const observer = new MutationObserver(records => {
      if (motion.matches || document.hidden) return;
      for (const record of records) {
        if (record.type === 'characterData') collect(record.target);
        else for (const node of record.addedNodes) collect(node);
      }
      if (pending.size && !frame) frame = window.requestAnimationFrame(paint);
    });
    const followScroll = () => {
      // Keep the accent attached while chat's automatic follow-scroll moves.
      for (const [owner, trail] of active) {
        if (!pending.has(owner)) pending.set(owner, trail.text);
      }
      if (pending.size && !frame) frame = window.requestAnimationFrame(paint);
    };
    // Only marked assistant replies are collected; other UI mutations are ignored.
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    motion.addEventListener('change', clear);
    document.addEventListener('scroll', followScroll, true);
    document.addEventListener('selectionchange', clear);
    document.addEventListener('visibilitychange', clear);
    window.addEventListener('resize', clear);

    return () => {
      observer.disconnect();
      clear();
      layer.remove();
      motion.removeEventListener('change', clear);
      document.removeEventListener('scroll', followScroll, true);
      document.removeEventListener('selectionchange', clear);
      document.removeEventListener('visibilitychange', clear);
      window.removeEventListener('resize', clear);
    };
  }, []);

  return null;
}
