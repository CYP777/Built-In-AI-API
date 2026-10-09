/**
 * Utility functions for handling Markdown text
 */

/**
 * Strips Markdown formatting syntax and converts to clean plain text.
 * Suitable for copying plain text to clipboard without markdown symbols.
 */
export function stripMarkdown(md: string): string {
  if (!md) return '';

  return md
    // Remove code block backticks
    .replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, '$1')
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove markdown table header separator rows like | :--- | :--- |
    .replace(/\|\s*:?-+:?\s*\|\s*:?-+:?\s*\|/g, '')
    // Convert table row lines | Col1 | Col2 | into clean readable lines
    .replace(/\|\s*([^|\n\r]+?)\s*\|\s*([^|\n\r]+?)\s*\|/g, (_, col1, col2) => {
      const c1 = String(col1).trim();
      const c2 = String(col2).trim();
      if (!c1 && !c2) return '';
      return `- ${c1}: ${c2}`;
    })
    // Remove headers (#, ##, ...)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold and italic (**, *, __, _)
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove strikethrough (~~)
    .replace(/~~(.*?)~~/g, '$1')
    // Remove blockquote symbol (> )
    .replace(/^>\s+/gm, '')
    // Remove links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images ![alt](url) -> alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove horizontal lines
    .replace(/^([-*_]){3,}\s*$/gm, '')
    // Remove any remaining stray pipes
    .replace(/\|/g, ' ')
    // Normalize excessive multiple empty lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
