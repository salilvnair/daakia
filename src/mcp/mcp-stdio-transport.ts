/**
 * MCP STDIO Transport — spawns a child process and communicates via stdin/stdout
 * using newline-delimited JSON-RPC 2.0 messages.
 */
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface McpTransportEvents {
  message: (msg: Record<string, unknown>) => void;
  error: (err: Error) => void;
  close: () => void;
}

export class McpStdioTransport extends EventEmitter {
  private _process: ChildProcess | null = null;
  private _buffer = '';
  private _connected = false;

  constructor(
    private _command: string,
    private _args: string[] = [],
    private _env: Record<string, string> = {},
    private _cwd?: string,
  ) {
    super();
  }

  get connected(): boolean { return this._connected; }

  /**
   * Start the child process and begin listening for JSON-RPC messages.
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const env = { ...process.env, ...this._env };
        // Filter out empty args (trailing empty strings from UI)
        const filteredArgs = this._args.filter(a => a.length > 0);
        this._process = spawn(this._command, filteredArgs, {
          env,
          cwd: this._cwd || undefined,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this._process.on('error', (err) => {
          this._connected = false;
          this.emit('error', err);
          reject(err);
        });

        this._process.on('exit', (code) => {
          this._connected = false;
          this.emit('close');
        });

        this._process.stdout?.on('data', (data: Buffer) => {
          this._onData(data.toString());
        });

        this._process.stderr?.on('data', (data: Buffer) => {
          // Stderr is used for logging by MCP servers, not protocol messages
        });

        // Consider connected once process is spawned
        this._connected = true;
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Send a JSON-RPC message to the child process via stdin.
   * Uses newline-delimited JSON.
   */
  send(message: Record<string, unknown>): void {
    if (!this._process?.stdin?.writable) {
      throw new Error('Transport not connected');
    }
    const json = JSON.stringify(message) + '\n';
    this._process.stdin.write(json);
  }

  /**
   * Close the transport and kill the child process.
   */
  close(): void {
    this._connected = false;
    if (this._process) {
      this._process.kill('SIGTERM');
      // Force kill after 5s if still alive
      setTimeout(() => {
        if (this._process && !this._process.killed) {
          this._process.kill('SIGKILL');
        }
      }, 5000);
      this._process = null;
    }
  }

  /**
   * Parse incoming data — newline-delimited JSON.
   * Lines that aren't valid JSON (Content-Length headers, server logs) are silently skipped.
   */
  private _onData(chunk: string): void {
    this._buffer += chunk;

    // Split by newline — complete lines are potential JSON messages
    const lines = this._buffer.split('\n');
    // Keep the last incomplete line in the buffer
    this._buffer = lines.pop()!;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed);
        this.emit('message', message);
      } catch {
        // Not valid JSON — skip (Content-Length headers, server log output, etc.)
      }
    }
  }
}
