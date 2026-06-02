export interface CodeGenInput {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  params: { key: string; value: string }[];
  bodyMode: string;
  bodyRaw: string;
  bodyFormData: { key: string; value: string; type: string }[];
  bodyUrlEncoded: { key: string; value: string }[];
  authType: string;
  authData: Record<string, string>;
}

export interface LanguageOption {
  id: string;
  label: string;
  extension: string;
}

export const LANGUAGES: LanguageOption[] = [
  { id: 'shell-curl', label: 'Shell - cURL', extension: 'sh' },
  { id: 'shell-wget', label: 'Shell - wget', extension: 'sh' },
  { id: 'javascript-fetch', label: 'JavaScript - Fetch', extension: 'js' },
  { id: 'javascript-axios', label: 'JavaScript - Axios', extension: 'js' },
  { id: 'javascript-xhr', label: 'JavaScript - XHR', extension: 'js' },
  { id: 'python-requests', label: 'Python - requests', extension: 'py' },
  { id: 'python-http', label: 'Python - http.client', extension: 'py' },
  { id: 'go-net', label: 'Go - net/http', extension: 'go' },
  { id: 'java-okhttp', label: 'Java - OkHttp', extension: 'java' },
  { id: 'csharp-httpclient', label: 'C# - HttpClient', extension: 'cs' },
  { id: 'php-curl', label: 'PHP - cURL', extension: 'php' },
  { id: 'ruby-net', label: 'Ruby - Net::HTTP', extension: 'rb' },
];

function buildFullUrl(url: string, params: { key: string; value: string }[]): string {
  if (!params.length) return url;
  const qs = params.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
  return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
}

function getAuthHeaders(authType: string, authData: Record<string, string>): { key: string; value: string }[] {
  if (authType === 'bearer' && authData.token) {
    return [{ key: 'Authorization', value: `Bearer ${authData.token}` }];
  }
  if (authType === 'basic' && authData.username) {
    const encoded = btoa(`${authData.username}:${authData.password || ''}`);
    return [{ key: 'Authorization', value: `Basic ${encoded}` }];
  }
  if (authType === 'apikey' && authData.key && authData.value) {
    if (authData.addTo === 'header' || !authData.addTo) {
      return [{ key: authData.key, value: authData.value }];
    }
  }
  return [];
}

function getBodyString(input: CodeGenInput): string | null {
  if (input.bodyMode === 'raw' && input.bodyRaw) return input.bodyRaw;
  if (input.bodyMode === 'x-www-form-urlencoded' && input.bodyUrlEncoded.length) {
    return input.bodyUrlEncoded.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
  }
  return null;
}

export function generateCode(input: CodeGenInput, language: string): string {
  const fullUrl = buildFullUrl(input.url, input.params);
  const allHeaders = [...input.headers, ...getAuthHeaders(input.authType, input.authData)];
  const body = getBodyString(input);

  switch (language) {
    case 'shell-curl': return genCurl(input.method, fullUrl, allHeaders, body, input);
    case 'shell-wget': return genWget(input.method, fullUrl, allHeaders, body);
    case 'javascript-fetch': return genFetch(input.method, fullUrl, allHeaders, body);
    case 'javascript-axios': return genAxios(input.method, fullUrl, allHeaders, body);
    case 'javascript-xhr': return genXhr(input.method, fullUrl, allHeaders, body);
    case 'python-requests': return genPythonRequests(input.method, fullUrl, allHeaders, body);
    case 'python-http': return genPythonHttp(input.method, fullUrl, allHeaders, body);
    case 'go-net': return genGo(input.method, fullUrl, allHeaders, body);
    case 'java-okhttp': return genJava(input.method, fullUrl, allHeaders, body);
    case 'csharp-httpclient': return genCsharp(input.method, fullUrl, allHeaders, body);
    case 'php-curl': return genPhpCurl(input.method, fullUrl, allHeaders, body);
    case 'ruby-net': return genRuby(input.method, fullUrl, allHeaders, body);
    default: return genCurl(input.method, fullUrl, allHeaders, body, input);
  }
}

function genCurl(method: string, url: string, headers: { key: string; value: string }[], body: string | null, input: CodeGenInput): string {
  const lines: string[] = [`curl --request ${method} \\`];
  lines.push(`  --url '${url}' \\`);
  for (const h of headers) {
    lines.push(`  --header '${h.key}: ${h.value}' \\`);
  }
  if (input.bodyMode === 'form-data' && input.bodyFormData.length) {
    for (const f of input.bodyFormData) {
      lines.push(`  --form '${f.key}=${f.value}' \\`);
    }
  } else if (body) {
    lines.push(`  --data '${body.replace(/'/g, "'\\''")}'`);
    return lines.join('\n');
  }
  // Remove trailing backslash from last line
  const last = lines[lines.length - 1];
  lines[lines.length - 1] = last.replace(/ \\$/, '');
  return lines.join('\n');
}

function genWget(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const lines: string[] = [`wget --method=${method} \\`];
  for (const h of headers) {
    lines.push(`  --header='${h.key}: ${h.value}' \\`);
  }
  if (body) {
    lines.push(`  --body-data='${body}' \\`);
  }
  lines.push(`  '${url}'`);
  return lines.join('\n');
}

function genFetch(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const opts: string[] = [];
  opts.push(`  method: '${method}',`);
  if (headers.length) {
    opts.push(`  headers: {`);
    for (const h of headers) {
      opts.push(`    '${h.key}': '${h.value}',`);
    }
    opts.push(`  },`);
  }
  if (body) {
    opts.push(`  body: ${JSON.stringify(body)},`);
  }
  return `const response = await fetch('${url}', {\n${opts.join('\n')}\n});\n\nconst data = await response.json();\nconsole.log(data);`;
}

function genAxios(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const lines: string[] = [`import axios from 'axios';`, '', `const response = await axios({`];
  lines.push(`  method: '${method.toLowerCase()}',`);
  lines.push(`  url: '${url}',`);
  if (headers.length) {
    lines.push(`  headers: {`);
    for (const h of headers) {
      lines.push(`    '${h.key}': '${h.value}',`);
    }
    lines.push(`  },`);
  }
  if (body) {
    lines.push(`  data: ${JSON.stringify(body)},`);
  }
  lines.push(`});`, '', `console.log(response.data);`);
  return lines.join('\n');
}

function genXhr(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const lines: string[] = [
    `const xhr = new XMLHttpRequest();`,
    `xhr.open('${method}', '${url}');`,
    ``,
  ];
  for (const h of headers) {
    lines.push(`xhr.setRequestHeader('${h.key}', '${h.value}');`);
  }
  lines.push(``, `xhr.onload = function () {`, `  console.log(xhr.responseText);`, `};`, ``);
  lines.push(`xhr.send(${body ? JSON.stringify(body) : ''});`);
  return lines.join('\n');
}

function genPythonRequests(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const lines: string[] = [`import requests`, ``];
  const args: string[] = [];
  if (headers.length) {
    const hd = headers.map(h => `    "${h.key}": "${h.value}"`).join(',\n');
    args.push(`headers={\n${hd}\n}`);
  }
  if (body) {
    args.push(`data=${JSON.stringify(body)}`);
  }
  const argsStr = args.length ? `,\n    ${args.join(',\n    ')}` : '';
  lines.push(`response = requests.${method.toLowerCase()}("${url}"${argsStr})`, ``);
  lines.push(`print(response.json())`);
  return lines.join('\n');
}

function genPythonHttp(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
  const lines: string[] = [
    `import http.client`,
    `import json`,
    ``,
    `conn = http.client.${urlObj.protocol === 'https:' ? 'HTTPS' : 'HTTP'}Connection("${urlObj.host}")`,
    ``,
  ];
  if (headers.length || body) {
    lines.push(`headers = {`);
    for (const h of headers) { lines.push(`    "${h.key}": "${h.value}",`); }
    lines.push(`}`, ``);
  }
  const path = urlObj.pathname + urlObj.search;
  lines.push(`conn.request("${method}", "${path}"${body ? `, body=${JSON.stringify(body)}` : ''}${headers.length ? ', headers=headers' : ''})`);
  lines.push(``, `res = conn.getresponse()`, `data = res.read()`, `print(data.decode("utf-8"))`);
  return lines.join('\n');
}

function genGo(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const lines: string[] = [
    `package main`,
    ``,
    `import (`,
    `\t"fmt"`,
    `\t"io"`,
    `\t"net/http"`,
    ...(body ? [`\t"strings"`] : []),
    `)`,
    ``,
    `func main() {`,
  ];
  if (body) {
    lines.push(`\tbody := strings.NewReader(${JSON.stringify(body)})`);
    lines.push(`\treq, _ := http.NewRequest("${method}", "${url}", body)`);
  } else {
    lines.push(`\treq, _ := http.NewRequest("${method}", "${url}", nil)`);
  }
  for (const h of headers) {
    lines.push(`\treq.Header.Add("${h.key}", "${h.value}")`);
  }
  lines.push(``, `\tres, _ := http.DefaultClient.Do(req)`, `\tdefer res.Body.Close()`);
  lines.push(``, `\tdata, _ := io.ReadAll(res.Body)`, `\tfmt.Println(string(data))`, `}`);
  return lines.join('\n');
}

function genJava(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const lines: string[] = [
    `OkHttpClient client = new OkHttpClient();`,
    ``,
  ];
  if (body) {
    lines.push(`MediaType mediaType = MediaType.parse("application/json");`);
    lines.push(`RequestBody body = RequestBody.create(mediaType, ${JSON.stringify(body)});`);
    lines.push(``);
  }
  lines.push(`Request request = new Request.Builder()`);
  lines.push(`    .url("${url}")`);
  lines.push(`    .method("${method}", ${body ? 'body' : 'null'})`);
  for (const h of headers) {
    lines.push(`    .addHeader("${h.key}", "${h.value}")`);
  }
  lines.push(`    .build();`, ``);
  lines.push(`Response response = client.newCall(request).execute();`);
  lines.push(`System.out.println(response.body().string());`);
  return lines.join('\n');
}

function genCsharp(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const lines: string[] = [
    `using var client = new HttpClient();`,
    ``,
    `var request = new HttpRequestMessage(HttpMethod.${method.charAt(0) + method.slice(1).toLowerCase()}, "${url}");`,
  ];
  for (const h of headers) {
    lines.push(`request.Headers.Add("${h.key}", "${h.value}");`);
  }
  if (body) {
    lines.push(`request.Content = new StringContent(${JSON.stringify(body)}, System.Text.Encoding.UTF8, "application/json");`);
  }
  lines.push(``, `var response = await client.SendAsync(request);`);
  lines.push(`var content = await response.Content.ReadAsStringAsync();`);
  lines.push(`Console.WriteLine(content);`);
  return lines.join('\n');
}

function genPhpCurl(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const lines: string[] = [
    `<?php`,
    `$ch = curl_init();`,
    ``,
    `curl_setopt($ch, CURLOPT_URL, "${url}");`,
    `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "${method}");`,
    `curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);`,
  ];
  if (headers.length) {
    lines.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, [`);
    for (const h of headers) { lines.push(`    "${h.key}: ${h.value}",`); }
    lines.push(`]);`);
  }
  if (body) {
    lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${JSON.stringify(body)});`);
  }
  lines.push(``, `$response = curl_exec($ch);`, `curl_close($ch);`, ``, `echo $response;`);
  return lines.join('\n');
}

function genRuby(method: string, url: string, headers: { key: string; value: string }[], body: string | null): string {
  const lines: string[] = [
    `require 'net/http'`,
    `require 'json'`,
    ``,
    `uri = URI("${url}")`,
    `http = Net::HTTP.new(uri.host, uri.port)`,
    `http.use_ssl = uri.scheme == "https"`,
    ``,
    `request = Net::HTTP::${method.charAt(0) + method.slice(1).toLowerCase()}.new(uri)`,
  ];
  for (const h of headers) {
    lines.push(`request["${h.key}"] = "${h.value}"`);
  }
  if (body) {
    lines.push(`request.body = ${JSON.stringify(body)}`);
  }
  lines.push(``, `response = http.request(request)`, `puts response.body`);
  return lines.join('\n');
}
