/**
 * MCP HTTP/SSE Transport — connects to an MCP server via HTTP.
 * Uses SSE for server-to-client messages and POST for client-to-server.
 */
import * as http from 'http';
import * as https from 'https';
import { EventEmitter } from 'events';

export class McpHttpTransport extends EventEmitter {
  private _connected = false;
  private _sseRequest: http.ClientRequest | null = null;
  private _sessionUrl: string | null = null;
  private _buffer = '';

  constructor(
    private _baseUrl: string,
    private _headers: Record<string, string> = {},
  ) {
    super();
  }

  get connected(): boolean { return this._connected; }

  /**
   * Connect to the SSE endpoint to receive server-to-client messages.
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(this._baseUrl);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;

        const options: http.RequestOptions = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            ...this._headers,
          },
        };

        this._sseRequest = lib.request(options, (res) => {
          if (res.statusCode !== 200) {
            const err = new Error(`SSE connection failed: HTTP ${res.statusCode}`);
            this.emit('error', err);
            reject(err);
            return;
          }

          this._connected = true;
          resolve();

          res.on('data', (chunk: Buffer) => {
            this._onSSEData(chunk.toString());
          });

          res.on('end', () => {
            this._connected = false;
            this.emit('close');
          });

          res.on('error', (err) => {
            this._connected = false;
            this.emit('error', err);
          });
        });

        this._sseRequest.on('error', (err) => {
          this._connected = false;
          this.emit('error', err);
          reject(err);
        });

        this._sseRequest.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Send a JSON-RPC message via HTTP POST.
   */
  send(message: Record<string, unknown>): void {
    if (!this._connected) {
      throw new Error('Transport not connected');
    }

    // POST to the session URL (provided by server in endpoint event) or base URL
    const targetUrl = this._sessionUrl || this._baseUrl;
    const url = new URL(targetUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const body = JSON.stringify(message);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...this._headers,
      },
    };

    const req = lib.request(options, (res) => {
      let respBody = '';
      res.on('data', (chunk) => { respBody += chunk.toString(); });
      res.on('end', () => {
        // POST responses may contain JSON-RPC responses
        if (respBody.trim()) {
          try {
            const parsed = JSON.parse(respBody);
            if (parsed.jsonrpc) {
              this.emit('message', parsed);
            }
          } catch { /* ignore non-JSON responses */ }
        }
      });
    });

    req.on('error', (err) => {
      this.emit('error', err);
    });

    req.write(body);
    req.end();
  }

  /**
   * Close the SSE connection.
   */
  close(): void {
    this._connected = false;
    if (this._sseRequest) {
      this._sseRequest.destroy();
      this._sseRequest = null;
    }
  }

  /**
   * Parse SSE data into JSON-RPC messages.
   */
  private _onSSEData(chunk: string): void {
    this._buffer += chunk;
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop() || '';

    let eventType = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      } else if (line.trim() === '' && data) {
        // End of event
        if (eventType === 'endpoint' && data) {
          // Server is telling us where to POST
          this._sessionUrl = data.startsWith('http') ? data : new URL(data, this._baseUrl).href;
        } else if (data) {
          try {
            const message = JSON.parse(data);
            this.emit('message', message);
          } catch {
            // Not JSON — ignore
          }
        }
        eventType = '';
        data = '';
      }
    }
  }
}
