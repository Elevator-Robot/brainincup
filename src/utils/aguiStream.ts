export type AguiEvent = Record<string, unknown> & { type: string };

export interface StreamAgentParams {
  conversationId: string;
  messageId: string;
  owner: string;
  content: string;
  onEvent: (event: AguiEvent) => void;
  signal?: AbortSignal;
}

export function getBrainApiUrl(): string {
  const outputs = (window as unknown as { __AMPLIFY_OUTPUTS__?: { custom?: { brainApiUrl?: string } } }).__AMPLIFY_OUTPUTS__;
  const url = outputs?.custom?.brainApiUrl;
  if (url && typeof url === 'string' && url.startsWith('http')) {
    return url;
  }
  return '';
}

export async function streamAgentMessage(params: StreamAgentParams): Promise<void> {
  const url = getBrainApiUrl();
  if (!url) {
    throw new Error('brainApiUrl is not configured in amplify outputs');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      conversationId: params.conversationId,
      messageId: params.messageId,
      owner: params.owner,
      content: params.content,
    }),
    signal: params.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream request failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
      if (!dataLine) continue;

      const payload = dataLine.slice(5).trim();
      if (payload === '[DONE]') return;

      try {
        const event = JSON.parse(payload) as AguiEvent;
        params.onEvent(event);
      } catch {
        // Ignore malformed frames
      }
    }
  }
}
