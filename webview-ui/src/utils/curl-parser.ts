export interface ParsedCurl {
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  bodyMode: 'raw' | 'form-data' | 'x-www-form-urlencoded' | 'none';
  bodyRaw: string;
  bodyFormData: { key: string; value: string; type: string; enabled: boolean }[];
  bodyUrlEncoded: { key: string; value: string; enabled: boolean }[];
}

export function parseCurl(input: string): ParsedCurl {
  // Normalize input: remove shell prompts, join multiline
  let normalized = input.trim();
  normalized = normalized.replace(/^\s*[$%#>]\s*/, '');
  normalized = normalized.replace(/\\\s*\n\s*/g, ' ');
  normalized = normalized.replace(/\\\s*\r\n\s*/g, ' ');

  // Remove leading "curl" command
  normalized = normalized.replace(/^curl\s+/i, '');

  const result: ParsedCurl = {
    method: 'GET',
    url: '',
    headers: [],
    bodyMode: 'none',
    bodyRaw: '',
    bodyFormData: [],
    bodyUrlEncoded: [],
  };

  const tokens = tokenize(normalized);
  let i = 0;
  let hasData = false;
  let hasForm = false;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      i++;
      if (i < tokens.length) result.method = tokens[i].toUpperCase();
    } else if (token === '--url') {
      i++;
      if (i < tokens.length) result.url = tokens[i];
    } else if (token === '-H' || token === '--header') {
      i++;
      if (i < tokens.length) {
        const headerStr = tokens[i];
        const colonIdx = headerStr.indexOf(':');
        if (colonIdx > 0) {
          result.headers.push({
            key: headerStr.slice(0, colonIdx).trim(),
            value: headerStr.slice(colonIdx + 1).trim(),
            enabled: true,
          });
        }
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-ascii') {
      i++;
      if (i < tokens.length) {
        hasData = true;
        const dataStr = tokens[i];
        // Check if it's form-urlencoded style (key=value&key=value)
        if (isUrlEncoded(dataStr)) {
          result.bodyMode = 'x-www-form-urlencoded';
          const pairs = dataStr.split('&');
          for (const pair of pairs) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx > 0) {
              result.bodyUrlEncoded.push({
                key: decodeURIComponent(pair.slice(0, eqIdx)),
                value: decodeURIComponent(pair.slice(eqIdx + 1)),
                enabled: true,
              });
            }
          }
        } else {
          result.bodyMode = 'raw';
          result.bodyRaw = dataStr;
        }
      }
    } else if (token === '-F' || token === '--form') {
      i++;
      if (i < tokens.length) {
        hasForm = true;
        const formStr = tokens[i];
        const eqIdx = formStr.indexOf('=');
        if (eqIdx > 0) {
          const key = formStr.slice(0, eqIdx);
          const value = formStr.slice(eqIdx + 1);
          const isFile = value.startsWith('@');
          result.bodyFormData.push({
            key,
            value: isFile ? value.slice(1) : value,
            type: isFile ? 'file' : 'text',
            enabled: true,
          });
        }
      }
    } else if (token === '-u' || token === '--user') {
      i++;
      if (i < tokens.length) {
        // Basic auth: username:password → add Authorization header
        const encoded = btoa(tokens[i]);
        result.headers.push({
          key: 'Authorization',
          value: `Basic ${encoded}`,
          enabled: true,
        });
      }
    } else if (token === '--compressed' || token === '-s' || token === '--silent' || token === '-k' || token === '--insecure' || token === '-L' || token === '--location' || token === '-i' || token === '--include' || token === '-v' || token === '--verbose') {
      // Skip flags that don't affect the request data
    } else if (token === '-o' || token === '--output' || token === '--connect-timeout' || token === '-m' || token === '--max-time') {
      i++; // Skip the value
    } else if (!token.startsWith('-') && !result.url) {
      // Bare URL
      result.url = token;
    }

    i++;
  }

  // Infer method from data
  if (hasData || hasForm) {
    if (result.method === 'GET') {
      result.method = 'POST';
    }
  }
  if (hasForm) {
    result.bodyMode = 'form-data';
  }

  return result;
}

function isUrlEncoded(str: string): boolean {
  // Simple heuristic: contains & and = but doesn't look like JSON
  if (str.startsWith('{') || str.startsWith('[') || str.startsWith('<')) return false;
  return str.includes('=') && !str.includes('\n');
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) break;

    const char = input[i];

    if (char === "'" || char === '"') {
      // Quoted string
      const quote = char;
      i++;
      let value = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && quote === '"') {
          i++;
          if (i < input.length) value += input[i];
        } else {
          value += input[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push(value);
    } else if (char === '$' && i + 1 < input.length && input[i + 1] === "'") {
      // $'...' ANSI-C quoting
      i += 2;
      let value = '';
      while (i < input.length && input[i] !== "'") {
        if (input[i] === '\\') {
          i++;
          if (i < input.length) {
            switch (input[i]) {
              case 'n': value += '\n'; break;
              case 't': value += '\t'; break;
              case '\\': value += '\\'; break;
              case "'": value += "'"; break;
              default: value += '\\' + input[i];
            }
          }
        } else {
          value += input[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push(value);
    } else {
      // Unquoted token
      let value = '';
      while (i < input.length && !/\s/.test(input[i])) {
        if (input[i] === '\\') {
          i++;
          if (i < input.length) value += input[i];
        } else {
          value += input[i];
        }
        i++;
      }
      tokens.push(value);
    }
  }

  return tokens;
}
