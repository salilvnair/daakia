/**
 * GraphQL query prettifier / formatter.
 * Formats a GraphQL query string with proper indentation and spacing.
 */

const INDENT = '  ';

export function formatGraphQLQuery(query: string): string {
  if (!query.trim()) return query;

  // Tokenize — split into meaningful chunks while preserving strings
  const tokens = tokenize(query);
  if (tokens.length === 0) return query;

  let result = '';
  let depth = 0;
  let lineStart = true;
  let prevToken = '';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === '{') {
      // Open brace — put space before, then newline + indent
      if (!lineStart) result += ' ';
      result += '{\n';
      depth++;
      result += INDENT.repeat(depth);
      lineStart = true;
    } else if (token === '}') {
      // Close brace — newline, decrease indent, then brace
      depth = Math.max(0, depth - 1);
      result = result.trimEnd() + '\n';
      result += INDENT.repeat(depth) + '}';
      lineStart = false;

      // Add newline after closing brace if next token isn't another } or is a named block
      const next = tokens[i + 1];
      if (next && next !== '}' && next !== ')') {
        result += '\n' + INDENT.repeat(depth);
        lineStart = true;
      }
    } else if (token === '(') {
      result += '(';
      lineStart = false;
    } else if (token === ')') {
      result += ')';
      lineStart = false;
    } else if (token === ':') {
      result += ': ';
      lineStart = false;
    } else if (token === ',') {
      result += ', ';
      lineStart = false;
    } else if (token === '...') {
      // Fragment spread
      if (!lineStart) {
        result = result.trimEnd() + '\n' + INDENT.repeat(depth);
      }
      result += '...';
      lineStart = false;
    } else if (token === '@') {
      result += ' @';
      lineStart = false;
    } else if (token === '!') {
      result += '!';
      lineStart = false;
    } else if (token === '=') {
      result += ' = ';
      lineStart = false;
    } else if (token === '|') {
      result += ' | ';
      lineStart = false;
    } else if (token === '$') {
      result += '$';
      lineStart = false;
    } else if (token === '#') {
      // Comment — read to end would be part of token
      result += token;
      lineStart = false;
    } else if (token.startsWith('#')) {
      // Full-line comment
      if (!lineStart) {
        result = result.trimEnd() + '\n' + INDENT.repeat(depth);
      }
      result += token + '\n' + INDENT.repeat(depth);
      lineStart = true;
    } else if (token.startsWith('"')) {
      // String literal
      if (!lineStart && !['(', ':', '$', '@'].includes(prevToken)) result += ' ';
      result += token;
      lineStart = false;
    } else {
      // Identifier, keyword, or value
      if (!lineStart && !['(', ':', '$', '@', '...'].includes(prevToken)) {
        // Check if we need a newline (field on same level)
        if (isFieldName(token, tokens, i) && isFieldName(prevToken, tokens, findPrevMeaningful(tokens, i))) {
          result = result.trimEnd() + '\n' + INDENT.repeat(depth);
        } else {
          result += ' ';
        }
      }
      result += token;
      lineStart = false;
    }

    prevToken = token;
  }

  // Clean up: remove trailing whitespace on each line
  return result
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim() + '\n';
}

function isFieldName(token: string, tokens: string[], index: number): boolean {
  if (!token || token.startsWith('#') || token.startsWith('"')) return false;
  if (['query', 'mutation', 'subscription', 'fragment', 'on', 'true', 'false', 'null'].includes(token)) return false;
  if (['{', '}', '(', ')', ':', ',', '!', '=', '|', '$', '@', '...'].includes(token)) return false;
  // Check that the token before it isn't a colon (it would be a type or value, not a field)
  const prev = findPrevMeaningful(tokens, index);
  if (prev >= 0 && tokens[prev] === ':') return false;
  if (prev >= 0 && tokens[prev] === '$') return false;
  if (prev >= 0 && tokens[prev] === '@') return false;
  if (prev >= 0 && tokens[prev] === '...') return false;
  return true;
}

function findPrevMeaningful(tokens: string[], index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    if (tokens[i].trim()) return i;
  }
  return -1;
}

function tokenize(query: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < query.length) {
    // Skip whitespace
    if (/\s/.test(query[i])) {
      i++;
      continue;
    }

    // Single-char tokens
    if ('{})(!|=,@$'.includes(query[i])) {
      tokens.push(query[i]);
      i++;
      continue;
    }

    // Colon
    if (query[i] === ':') {
      tokens.push(':');
      i++;
      continue;
    }

    // Spread operator
    if (query[i] === '.' && query[i + 1] === '.' && query[i + 2] === '.') {
      tokens.push('...');
      i += 3;
      continue;
    }

    // Comment — take until end of line
    if (query[i] === '#') {
      let comment = '#';
      i++;
      while (i < query.length && query[i] !== '\n') {
        comment += query[i];
        i++;
      }
      tokens.push(comment);
      continue;
    }

    // String (double-quoted, possibly triple-quoted)
    if (query[i] === '"') {
      if (query[i + 1] === '"' && query[i + 2] === '"') {
        // Block string
        let str = '"""';
        i += 3;
        while (i < query.length) {
          if (query[i] === '"' && query[i + 1] === '"' && query[i + 2] === '"') {
            str += '"""';
            i += 3;
            break;
          }
          str += query[i];
          i++;
        }
        tokens.push(str);
      } else {
        // Regular string
        let str = '"';
        i++;
        while (i < query.length && query[i] !== '"') {
          if (query[i] === '\\') {
            str += query[i] + query[i + 1];
            i += 2;
          } else {
            str += query[i];
            i++;
          }
        }
        str += '"';
        i++; // skip closing quote
        tokens.push(str);
      }
      continue;
    }

    // Identifier / keyword / number
    let word = '';
    while (i < query.length && !/[\s{}()!|=,:@$"#.]/.test(query[i])) {
      word += query[i];
      i++;
    }
    // Special case: check for dot that's not part of spread
    if (word && i < query.length && query[i] === '.' && !(query[i + 1] === '.' && query[i + 2] === '.')) {
      word += query[i];
      i++;
    }
    if (word) tokens.push(word);
  }

  return tokens;
}
