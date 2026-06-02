import { useState } from 'react';
import { StyledDropdown } from '../controls/StyledDropdown';
import { Checkbox } from '../controls/Checkbox';
import { EyeIcon, EyeOffIcon, RefreshIcon } from '../../../icons';

export interface AuthData {
  token?: string;
  username?: string;
  password?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: string;
  // OAuth2 fields
  oauth2GrantType?: string;
  oauth2AuthUrl?: string;
  oauth2TokenUrl?: string;
  oauth2ClientId?: string;
  oauth2ClientSecret?: string;
  oauth2Scope?: string;
  oauth2RedirectUri?: string;
  oauth2Username?: string;
  oauth2Password?: string;
  oauth2UsePkce?: string;
  accessToken?: string;
}

interface AuthEditorProps {
  authType: string;
  authData: AuthData;
  onAuthTypeChange: (type: string) => void;
  onAuthDataChange: (data: AuthData) => void;
  onGetOAuth2Token?: () => void;
  oauth2Loading?: boolean;
  accentColor?: string;
}

const AUTH_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'api-key', label: 'API Key' },
  { value: 'oauth2', label: 'OAuth 2.0' },
];

const GRANT_TYPE_OPTIONS = [
  { value: 'authorization_code', label: 'Authorization Code' },
  { value: 'client_credentials', label: 'Client Credentials' },
  { value: 'password', label: 'Password' },
];

export function AuthEditor({ authType, authData, onAuthTypeChange, onAuthDataChange, onGetOAuth2Token, oauth2Loading, accentColor }: AuthEditorProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {/* Auth type row */}
      <div className="flex items-center px-1">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[120px] flex-shrink-0">Authorization Type</span>
        <StyledDropdown
          options={AUTH_OPTIONS}
          value={authType}
          onChange={onAuthTypeChange}
          size="sm"
          accentColor={accentColor}
        />
      </div>

      {/* Bearer Token */}
      {authType === 'bearer' && (
        <div className="flex items-center px-1">
          <span className="text-[12px] text-[var(--color-text-muted)] w-[120px] flex-shrink-0">Token</span>
          <div className="flex-1 relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={authData.token || ''}
              onChange={(e) => onAuthDataChange({ ...authData, token: e.target.value })}
              placeholder="Your Bearer Token (e.g. sk_live_abc123xyz789)"
              className="w-full h-[28px] px-2.5 py-1 pr-8 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-0 top-0 bottom-0 flex items-center px-2 rounded-r-md bg-[var(--color-input-bg)] border-l border-[var(--color-input-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
              title={showToken ? 'Hide' : 'Show'}
            >
              <EyeIconLocal open={showToken} />
            </button>
          </div>
        </div>
      )}

      {/* Basic Auth */}
      {authType === 'basic' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center px-1">
            <span className="text-[12px] text-[var(--color-text-muted)] w-[120px] flex-shrink-0">Username</span>
            <input
              type="text"
              value={authData.username || ''}
              onChange={(e) => onAuthDataChange({ ...authData, username: e.target.value })}
              placeholder="john_doe"
              className="flex-1 h-[28px] px-2.5 py-1 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div className="flex items-center px-1">
            <span className="text-[12px] text-[var(--color-text-muted)] w-[120px] flex-shrink-0">Password</span>
            <div className="flex-1 relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={authData.password || ''}
                onChange={(e) => onAuthDataChange({ ...authData, password: e.target.value })}
                placeholder="Enter password"
                className="w-full h-[28px] px-2.5 py-1 pr-8 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                title={showPassword ? 'Hide' : 'Show'}
              >
                <EyeIconLocal open={showPassword} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Key */}
      {authType === 'api-key' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center px-1">
            <span className="text-[12px] text-[var(--color-text-muted)] w-[120px] flex-shrink-0">Key</span>
            <input
              type="text"
              value={authData.apiKeyName || ''}
              onChange={(e) => onAuthDataChange({ ...authData, apiKeyName: e.target.value })}
              placeholder="X-API-Key"
              className="flex-1 h-[28px] px-2.5 py-1 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div className="flex items-center px-1">
            <span className="text-[12px] text-[var(--color-text-muted)] w-[120px] flex-shrink-0">Value</span>
            <div className="flex-1 relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={authData.apiKeyValue || ''}
                onChange={(e) => onAuthDataChange({ ...authData, apiKeyValue: e.target.value })}
                placeholder="Enter API key value"
                className="w-full h-[28px] px-2.5 py-1 pr-8 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                title={showApiKey ? 'Hide' : 'Show'}
              >
                <EyeIconLocal open={showApiKey} />
              </button>
            </div>
          </div>
          <div className="flex items-center px-1">
            <span className="text-[12px] text-[var(--color-text-muted)] w-[120px] flex-shrink-0">Add to</span>
            <StyledDropdown
              options={[
                { value: 'header', label: 'Header' },
                { value: 'query', label: 'Query Params' },
              ]}
              value={authData.apiKeyIn || 'header'}
              onChange={(v) => onAuthDataChange({ ...authData, apiKeyIn: v })}
              size="sm"
              accentColor={accentColor}
            />
          </div>
        </div>
      )}

      {/* OAuth 2.0 */}
      {authType === 'oauth2' && (
        <OAuth2Section
          authData={authData}
          onAuthDataChange={onAuthDataChange}
          onGetToken={onGetOAuth2Token}
          loading={oauth2Loading}
          accentColor={accentColor}
        />
      )}

      {authType === 'none' && (
        <p className="text-[12px] text-[var(--color-text-muted)] py-6 text-center">
          No authentication configured for this request.
        </p>
      )}
    </div>
  );
}

function EyeIconLocal({ open }: { open: boolean }) {
  if (open) {
    return <EyeIcon size={14} />;
  }
  return <EyeOffIcon size={14} />;
}

// ────────────────── OAuth2 Section ──────────────────

interface OAuth2SectionProps {
  authData: AuthData;
  onAuthDataChange: (data: AuthData) => void;
  onGetToken?: () => void;
  loading?: boolean;
  accentColor?: string;
}

function OAuth2Section({ authData, onAuthDataChange, onGetToken, loading, accentColor }: OAuth2SectionProps) {
  const [showSecret, setShowSecret] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const grantType = authData.oauth2GrantType || 'authorization_code';

  const inputClass = "flex-1 h-[28px] px-2.5 py-1 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]";
  const labelClass = "text-[12px] text-[var(--color-text-muted)] w-[120px] flex-shrink-0";

  return (
    <div className="flex flex-col gap-2">
      {/* Grant Type */}
      <div className="flex items-center px-1">
        <span className={labelClass}>Grant Type</span>
        <StyledDropdown
          options={GRANT_TYPE_OPTIONS}
          value={grantType}
          onChange={(v) => onAuthDataChange({ ...authData, oauth2GrantType: v })}
          size="sm"
          accentColor={accentColor}
        />
      </div>

      {/* Auth URL (auth code only) */}
      {grantType === 'authorization_code' && (
        <div className="flex items-center px-1">
          <span className={labelClass}>Auth URL</span>
          <input
            type="text"
            value={authData.oauth2AuthUrl || ''}
            onChange={(e) => onAuthDataChange({ ...authData, oauth2AuthUrl: e.target.value })}
            placeholder="https://provider.com/authorize"
            className={inputClass}
          />
        </div>
      )}

      {/* Token URL */}
      <div className="flex items-center px-1">
        <span className={labelClass}>Token URL</span>
        <input
          type="text"
          value={authData.oauth2TokenUrl || ''}
          onChange={(e) => onAuthDataChange({ ...authData, oauth2TokenUrl: e.target.value })}
          placeholder="https://provider.com/token"
          className={inputClass}
        />
      </div>

      {/* Client ID */}
      <div className="flex items-center px-1">
        <span className={labelClass}>Client ID</span>
        <input
          type="text"
          value={authData.oauth2ClientId || ''}
          onChange={(e) => onAuthDataChange({ ...authData, oauth2ClientId: e.target.value })}
          placeholder="your-client-id"
          className={inputClass}
        />
      </div>

      {/* Client Secret */}
      <div className="flex items-center px-1">
        <span className={labelClass}>Client Secret</span>
        <div className="flex-1 relative">
          <input
            type={showSecret ? 'text' : 'password'}
            value={authData.oauth2ClientSecret || ''}
            onChange={(e) => onAuthDataChange({ ...authData, oauth2ClientSecret: e.target.value })}
            placeholder="your-client-secret"
            className="w-full h-[28px] px-2.5 py-1 pr-8 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
          >
            <EyeIconLocal open={showSecret} />
          </button>
        </div>
      </div>

      {/* Scope */}
      <div className="flex items-center px-1">
        <span className={labelClass}>Scope</span>
        <input
          type="text"
          value={authData.oauth2Scope || ''}
          onChange={(e) => onAuthDataChange({ ...authData, oauth2Scope: e.target.value })}
          placeholder="read write (space-separated)"
          className={inputClass}
        />
      </div>

      {/* Redirect URI (auth code only) */}
      {grantType === 'authorization_code' && (
        <>
          <div className="flex items-center px-1">
            <span className={labelClass}>Redirect URI</span>
            <input
              type="text"
              value={authData.oauth2RedirectUri || ''}
              onChange={(e) => onAuthDataChange({ ...authData, oauth2RedirectUri: e.target.value })}
              placeholder="http://localhost:43789/callback"
              className={inputClass}
            />
          </div>
          <div className="flex items-center px-1">
            <span className={labelClass}>Use PKCE</span>
            <Checkbox
              checked={authData.oauth2UsePkce === 'true'}
              onChange={(v) => onAuthDataChange({ ...authData, oauth2UsePkce: v ? 'true' : 'false' })}
              label="Enable PKCE (S256)"
              accentColor={accentColor}
            />
          </div>
        </>
      )}

      {/* Username/Password (password grant only) */}
      {grantType === 'password' && (
        <>
          <div className="flex items-center px-1">
            <span className={labelClass}>Username</span>
            <input
              type="text"
              value={authData.oauth2Username || ''}
              onChange={(e) => onAuthDataChange({ ...authData, oauth2Username: e.target.value })}
              placeholder="username"
              className={inputClass}
            />
          </div>
          <div className="flex items-center px-1">
            <span className={labelClass}>Password</span>
            <div className="flex-1 relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={authData.oauth2Password || ''}
                onChange={(e) => onAuthDataChange({ ...authData, oauth2Password: e.target.value })}
                placeholder="password"
                className="w-full h-[28px] px-2.5 py-1 pr-8 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
              >
                <EyeIconLocal open={showPassword} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Separator */}
      <div className="border-t border-[var(--color-border)] my-1" />

      {/* Access Token (result) */}
      <div className="flex items-center px-1">
        <span className={labelClass}>Access Token</span>
        <div className="flex-1 relative">
          <input
            type={showToken ? 'text' : 'password'}
            value={authData.accessToken || ''}
            onChange={(e) => onAuthDataChange({ ...authData, accessToken: e.target.value })}
            placeholder="Token will appear here after fetching"
            className="w-full h-[28px] px-2.5 py-1 pr-8 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
          >
            <EyeIconLocal open={showToken} />
          </button>
        </div>
      </div>

      {/* Get Token button */}
      <div className="flex items-center px-1">
        <span className={labelClass} />
        <button
          type="button"
          onClick={onGetToken}
          disabled={loading || !authData.oauth2TokenUrl || !authData.oauth2ClientId}
          className="h-[28px] px-3 text-[12px] font-medium rounded-md text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 transition-opacity"
          style={{ backgroundColor: accentColor || 'var(--color-primary)' }}
        >
          <RefreshIcon size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Fetching...' : 'Get Token'}
        </button>
      </div>
    </div>
  );
}
