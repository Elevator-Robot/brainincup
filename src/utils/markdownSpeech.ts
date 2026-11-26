import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

interface ProseNode {
  type: string;
  value?: string;
  alt?: string | null;
  children?: ProseNode[];
}

const parser = unified().use(remarkParse).use(remarkGfm);
const blocks = new Set(['paragraph', 'heading', 'blockquote', 'listItem', 'tableCell', 'code', 'break', 'thematicBreak']);
const literals = new Set(['text', 'inlineCode', 'code', 'html']);

/** One Markdown traversal for both speech and presentation. Offsets refer to
 * decoded, visible text, never formatting markers or link destinations. */
function project(root: ProseNode, limit = Infinity): string {
  let text = '';
  let space = false;
  const visit = (node: ProseNode): boolean => {
    // Definitions resolve reference links but are not displayed themselves.
    if (node.type === 'definition') return true;
    const block = blocks.has(node.type);
    if (block) space = Boolean(text);
    if (node.children) node.children = node.children.filter(visit);
    const field = node.type === 'image' || node.type === 'imageReference' ? 'alt' : literals.has(node.type) ? 'value' : null;
    if (field) {
      const value = node[field] ?? '';
      let end = 0, visibleEnd = 0;
      for (const character of value) {
        end += character.length;
        if (/\s/u.test(character)) {
          space = Boolean(text);
        } else {
          if (space) text += ' ';
          text += character;
          space = false;
        }
        if (text.length + (space ? 1 : 0) <= limit) visibleEnd = end;
      }
      node[field] = value.slice(0, visibleEnd);
      if (block) space = Boolean(text);
      return visibleEnd > 0;
    }
    if (block) space = Boolean(text);
    return node.children ? node.children.length > 0 : text.length < limit;
  };
  visit(root);
  return text;
}

export function markdownSpeechText(markdown: string): string {
  return project(parser.parse(markdown));
}

/** Truncate text leaves after parsing so unfinished bold, links, entities,
 * lists and code never expose raw Markdown or future paragraphs. */
export function remarkCharacterReveal(options: { limit: number }) {
  return (tree: ProseNode) => { project(tree, options.limit); };
}
