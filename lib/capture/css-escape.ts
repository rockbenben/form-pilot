/**
 * CSS.escape polyfill. Uses native `CSS.escape` when available (all modern
 * browsers), falls back to a manual implementation for jsdom / older
 * environments. Covers identifiers (`#id`) and attribute values.
 */
export const cssEscape: (s: string) => string =
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? (s) => CSS.escape(s)
    : (s) => {
        if (s.length === 0) return '';
        const first = s.codePointAt(0)!;
        let result = '';
        if (first >= 0x30 && first <= 0x39) {
          result += `\\${first.toString(16)} `;
          result += s.slice(1).replace(/[^\w-]/g, (c) => `\\${c}`);
        } else {
          result = s.replace(/[^\w-]/g, (c) => `\\${c}`);
        }
        return result;
      };
