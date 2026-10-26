/** Only public message text goes to TTS, never reasoning/tool metadata. */
export function spokenText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };
      if (entity[0] !== '#') return named[entity.toLowerCase()] || match;
      const point = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/\s+/g, ' ').trim();
}

export function speechChunks(text: string, limit = 900): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
    const word = window.lastIndexOf(' ');
    let end = sentence > limit / 2 ? sentence + 1 : word > limit / 2 ? word : limit;
    // Do not split a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
