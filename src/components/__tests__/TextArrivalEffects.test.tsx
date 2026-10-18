import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TextArrivalEffects from '../TextArrivalEffects';

let reducedMotion = false;

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion = false;
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reducedMotion; },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(document, 'createRange').mockReturnValue({
    setStart: vi.fn(), setEnd: vi.fn(),
    getClientRects: () => [{ left: 100, right: 110, top: 100, bottom: 120, width: 10, height: 20 }],
  } as unknown as Range);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function paint() {
  await act(async () => { await Promise.resolve(); });
  act(() => { vi.advanceTimersByTime(20); });
}

describe('assistant chat text-arrival accents', () => {
  it('decorates updated paragraphs, headings, lists, and code without altering their text', async () => {
    const view = (text: string) => <><TextArrivalEffects /><section data-chat-arrival>
      <h2>{text}</h2><p>{text}<strong> bold</strong></p><ul><li>{text}</li></ul><pre><code>{text}</code></pre>
    </section></>;
    const { rerender, container } = render(view('Before'));
    const paragraph = container.querySelector('p');
    rerender(view('After'));
    await paint();
    expect(document.querySelectorAll('.cosmic-text-arrival-trail')).toHaveLength(4);
    expect(container.querySelector('p')).toBe(paragraph);
    expect(paragraph?.textContent).toBe('After bold');
    expect(paragraph?.querySelector('span')).toBeNull();
    expect(document.querySelector('[data-cosmic-text-layer]')).toHaveAttribute('aria-hidden', 'true');
    act(() => { vi.advanceTimersByTime(800); });
    expect(document.querySelectorAll('.cosmic-text-arrival-trail')).toHaveLength(0);
  });

  it('does not decorate editable or hidden text', async () => {
    const view = (text: string) => <><TextArrivalEffects /><section data-chat-arrival>
      <div contentEditable suppressContentEditableWarning>{text}</div>
      <p aria-hidden="true">{text}</p><p data-text-arrival="off">{text}</p>
    </section></>;
    const { rerender } = render(view('Before'));
    rerender(view('After'));
    await paint();
    expect(document.querySelectorAll('.cosmic-text-arrival-trail')).toHaveLength(0);
  });

  it('respects reduced motion and removes its layer on unmount', async () => {
    reducedMotion = true;
    const view = (text: string) => <><TextArrivalEffects /><p data-chat-arrival>{text}</p></>;
    const { rerender, unmount } = render(view('Before'));
    rerender(view('After'));
    await paint();
    expect(document.querySelectorAll('.cosmic-text-arrival-trail')).toHaveLength(0);
    unmount();
    expect(document.querySelector('[data-cosmic-text-layer]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores dialogs and other text outside assistant chat', async () => {
    render(<TextArrivalEffects />);
    const dialog = document.createElement('div');
    dialog.innerHTML = '<p>New portal text</p>';
    document.body.appendChild(dialog);
    try {
      await paint();
      expect(document.querySelectorAll('.cosmic-text-arrival-trail')).toHaveLength(0);
    } finally {
      dialog.remove();
    }
  });
});
