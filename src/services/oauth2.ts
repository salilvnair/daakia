/**
 * OAuth2 token exchange service.
 * Supports: Authorization Code, Authorization Code + PKCE, Client Credentials, Password.
 */
import * as http from 'http';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import axios from 'axios';

export interface OAuth2Config {
  grantType: 'authorization_code' | 'client_credentials' | 'password' | 'implicit';
  authUrl?: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  redirectUri?: string;
  username?: string;
  password?: string;
  usePkce?: boolean;
  state?: string;
}

export interface OAuth2TokenResult {
  success: boolean;
  accessToken?: string;
  tokenType?: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
  error?: string;
}

/**
 * Fetch an OAuth2 token based on grant type.
 */
export async function getOAuth2Token(config: OAuth2Config): Promise<OAuth2TokenResult> {
  switch (config.grantType) {
    case 'client_credentials':
      return clientCredentialsFlow(config);
    case 'password':
      return passwordFlow(config);
    case 'authorization_code':
      return authorizationCodeFlow(config);
    default:
      return { success: false, error: `Unsupported grant type: ${config.grantType}` };
  }
}

// ────────────────── Client Credentials ──────────────────

async function clientCredentialsFlow(config: OAuth2Config): Promise<OAuth2TokenResult> {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', config.clientId);
  if (config.clientSecret) params.append('client_secret', config.clientSecret);
  if (config.scope) params.append('scope', config.scope);

  return postTokenRequest(config.tokenUrl, params);
}

// ────────────────── Resource Owner Password ──────────────────

async function passwordFlow(config: OAuth2Config): Promise<OAuth2TokenResult> {
  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('client_id', config.clientId);
  if (config.clientSecret) params.append('client_secret', config.clientSecret);
  if (config.username) params.append('username', config.username);
  if (config.password) params.append('password', config.password);
  if (config.scope) params.append('scope', config.scope);

  return postTokenRequest(config.tokenUrl, params);
}

// ────────────────── Authorization Code (+ PKCE) ──────────────────

async function authorizationCodeFlow(config: OAuth2Config): Promise<OAuth2TokenResult> {
  if (!config.authUrl) {
    return { success: false, error: 'Authorization URL is required for Authorization Code flow' };
  }

  // Generate PKCE pair if enabled
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;
  if (config.usePkce) {
    codeVerifier = generateCodeVerifier();
    codeChallenge = generateCodeChallenge(codeVerifier);
  }

  const state = config.state || crypto.randomBytes(16).toString('hex');
  const redirectUri = config.redirectUri || 'http://localhost:43789/callback';

  // Parse port from redirect URI
  const redirectUrl = new URL(redirectUri);
  const port = parseInt(redirectUrl.port) || 43789;
  const callbackPath = redirectUrl.pathname || '/callback';

  // Build authorization URL
  const authParams = new URLSearchParams();
  authParams.append('response_type', 'code');
  authParams.append('client_id', config.clientId);
  authParams.append('redirect_uri', redirectUri);
  authParams.append('state', state);
  if (config.scope) authParams.append('scope', config.scope);
  if (codeChallenge) {
    authParams.append('code_challenge', codeChallenge);
    authParams.append('code_challenge_method', 'S256');
  }

  const fullAuthUrl = `${config.authUrl}${config.authUrl.includes('?') ? '&' : '?'}${authParams.toString()}`;

  // Start local callback server and open browser
  const code = await waitForAuthorizationCode(port, callbackPath, state, fullAuthUrl);
  if (!code) {
    return { success: false, error: 'Authorization was cancelled or timed out' };
  }

  // Exchange code for token
  const tokenParams = new URLSearchParams();
  tokenParams.append('grant_type', 'authorization_code');
  tokenParams.append('code', code);
  tokenParams.append('client_id', config.clientId);
  tokenParams.append('redirect_uri', redirectUri);
  if (config.clientSecret) tokenParams.append('client_secret', config.clientSecret);
  if (codeVerifier) tokenParams.append('code_verifier', codeVerifier);

  return postTokenRequest(config.tokenUrl, tokenParams);
}

// ────────────────── Helpers ──────────────────

async function postTokenRequest(tokenUrl: string, params: URLSearchParams): Promise<OAuth2TokenResult> {
  try {
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    });

    const data = response.data;
    if (data.access_token) {
      return {
        success: true,
        accessToken: data.access_token,
        tokenType: data.token_type || 'Bearer',
        expiresIn: data.expires_in,
        refreshToken: data.refresh_token,
        scope: data.scope,
      };
    }
    return { success: false, error: data.error_description || data.error || 'No access token in response' };
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.data) {
      const d = err.response.data;
      return { success: false, error: d.error_description || d.error || err.message };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function waitForAuthorizationCode(port: number, callbackPath: string, expectedState: string, authUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      server.close();
      resolve(null);
    }, 120_000); // 2 minute timeout

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${port}`);

      if (url.pathname !== callbackPath) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authorization Failed</h2><p>You can close this window.</p></body></html>');
        clearTimeout(timeout);
        server.close();
        resolve(null);
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Invalid State</h2><p>State mismatch. You can close this window.</p></body></html>');
        clearTimeout(timeout);
        server.close();
        resolve(null);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authorization Successful</h2><p>You can close this window and return to VS Code.</p></body></html>');
      clearTimeout(timeout);
      server.close();
      resolve(code);
    });

    server.listen(port, '127.0.0.1', () => {
      vscode.env.openExternal(vscode.Uri.parse(authUrl));
    });

    server.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}
