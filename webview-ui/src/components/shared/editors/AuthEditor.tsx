import { SelectInputView, TextInputView, CheckboxView } from '../../../dui';
import { RefreshIcon } from '../../../icons';

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

const LABEL = 'text-[12px] text-[var(--color-text-muted)] w-[120px] flex-shrink-0';
const ROW = 'flex items-center px-1';
const W = { width: '30%' } as const;

export function AuthEditor({ authType, authData, onAuthTypeChange, onAuthDataChange, onGetOAuth2Token, oauth2Loading, accentColor }: AuthEditorProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      {/* Auth type row */}
      <div className={ROW}>
        <span className={LABEL}>Authorization Type</span>
        <SelectInputView
          options={AUTH_OPTIONS}
          value={authType}
          onChange={onAuthTypeChange}
          size="md"
          accentColor={accentColor}
          style={W}
        />
      </div>

      {/* Bearer Token */}
      {authType === 'bearer' && (
        <div className={ROW}>
          <span className={LABEL}>Token</span>
          <TextInputView
            value={authData.token || ''}
            onChange={(e) => onAuthDataChange({ ...authData, token: e.target.value })}
            placeholder="Your Bearer Token (e.g. sk_live_abc123xyz789)"
            size="md"
            masked
            accentColor={accentColor}
            style={W}
          />
        </div>
      )}

      {/* Basic Auth */}
      {authType === 'basic' && (
        <div className="flex flex-col gap-2">
          <div className={ROW}>
            <span className={LABEL}>Username</span>
            <TextInputView
              value={authData.username || ''}
              onChange={(e) => onAuthDataChange({ ...authData, username: e.target.value })}
              placeholder="john_doe"
              size="md"
              accentColor={accentColor}
              style={W}
            />
          </div>
          <div className={ROW}>
            <span className={LABEL}>Password</span>
            <TextInputView
              value={authData.password || ''}
              onChange={(e) => onAuthDataChange({ ...authData, password: e.target.value })}
              placeholder="Enter password"
              size="md"
              masked
              accentColor={accentColor}
              style={W}
            />
          </div>
        </div>
      )}

      {/* API Key */}
      {authType === 'api-key' && (
        <div className="flex flex-col gap-2">
          <div className={ROW}>
            <span className={LABEL}>Key</span>
            <TextInputView
              value={authData.apiKeyName || ''}
              onChange={(e) => onAuthDataChange({ ...authData, apiKeyName: e.target.value })}
              placeholder="X-API-Key"
              size="md"
              accentColor={accentColor}
              style={W}
            />
          </div>
          <div className={ROW}>
            <span className={LABEL}>Value</span>
            <TextInputView
              value={authData.apiKeyValue || ''}
              onChange={(e) => onAuthDataChange({ ...authData, apiKeyValue: e.target.value })}
              placeholder="Enter API key value"
              size="md"
              masked
              accentColor={accentColor}
              style={W}
            />
          </div>
          <div className={ROW}>
            <span className={LABEL}>Add to</span>
            <SelectInputView
              options={[
                { value: 'header', label: 'Header' },
                { value: 'query', label: 'Query Params' },
              ]}
              value={authData.apiKeyIn || 'header'}
              onChange={(v) => onAuthDataChange({ ...authData, apiKeyIn: v })}
              size="md"
              accentColor={accentColor}
              style={W}
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

// ────────────────── OAuth2 Section ──────────────────

interface OAuth2SectionProps {
  authData: AuthData;
  onAuthDataChange: (data: AuthData) => void;
  onGetToken?: () => void;
  loading?: boolean;
  accentColor?: string;
}

function OAuth2Section({ authData, onAuthDataChange, onGetToken, loading, accentColor }: OAuth2SectionProps) {
  const grantType = authData.oauth2GrantType || 'authorization_code';

  return (
    <div className="flex flex-col gap-2">
      {/* Grant Type */}
      <div className={ROW}>
        <span className={LABEL}>Grant Type</span>
        <SelectInputView
          options={GRANT_TYPE_OPTIONS}
          value={grantType}
          onChange={(v) => onAuthDataChange({ ...authData, oauth2GrantType: v })}
          size="md"
          accentColor={accentColor}
          style={W}
        />
      </div>

      {/* Auth URL (auth code only) */}
      {grantType === 'authorization_code' && (
        <div className={ROW}>
          <span className={LABEL}>Auth URL</span>
          <TextInputView
            value={authData.oauth2AuthUrl || ''}
            onChange={(e) => onAuthDataChange({ ...authData, oauth2AuthUrl: e.target.value })}
            placeholder="https://provider.com/authorize"
            size="md"
            accentColor={accentColor}
            style={W}
          />
        </div>
      )}

      {/* Token URL */}
      <div className={ROW}>
        <span className={LABEL}>Token URL</span>
        <TextInputView
          value={authData.oauth2TokenUrl || ''}
          onChange={(e) => onAuthDataChange({ ...authData, oauth2TokenUrl: e.target.value })}
          placeholder="https://provider.com/token"
          size="md"
          accentColor={accentColor}
          style={W}
        />
      </div>

      {/* Client ID */}
      <div className={ROW}>
        <span className={LABEL}>Client ID</span>
        <TextInputView
          value={authData.oauth2ClientId || ''}
          onChange={(e) => onAuthDataChange({ ...authData, oauth2ClientId: e.target.value })}
          placeholder="your-client-id"
          size="md"
          accentColor={accentColor}
          style={W}
        />
      </div>

      {/* Client Secret */}
      <div className={ROW}>
        <span className={LABEL}>Client Secret</span>
        <TextInputView
          value={authData.oauth2ClientSecret || ''}
          onChange={(e) => onAuthDataChange({ ...authData, oauth2ClientSecret: e.target.value })}
          placeholder="your-client-secret"
          size="md"
          masked
          accentColor={accentColor}
          style={W}
        />
      </div>

      {/* Scope */}
      <div className={ROW}>
        <span className={LABEL}>Scope</span>
        <TextInputView
          value={authData.oauth2Scope || ''}
          onChange={(e) => onAuthDataChange({ ...authData, oauth2Scope: e.target.value })}
          placeholder="read write (space-separated)"
          size="md"
          accentColor={accentColor}
          style={W}
        />
      </div>

      {/* Redirect URI + PKCE (auth code only) */}
      {grantType === 'authorization_code' && (
        <>
          <div className={ROW}>
            <span className={LABEL}>Redirect URI</span>
            <TextInputView
              value={authData.oauth2RedirectUri || ''}
              onChange={(e) => onAuthDataChange({ ...authData, oauth2RedirectUri: e.target.value })}
              placeholder="http://localhost:43789/callback"
              size="md"
              accentColor={accentColor}
              style={W}
            />
          </div>
          <div className={ROW}>
            <span className={LABEL}>Use PKCE</span>
            <CheckboxView
              checked={authData.oauth2UsePkce === 'true'}
              onChange={(v) => onAuthDataChange({ ...authData, oauth2UsePkce: v ? 'true' : 'false' })}
              label="Enable PKCE (S256)"
              size="md"
              accentColor={accentColor}
            />
          </div>
        </>
      )}

      {/* Username/Password (password grant only) */}
      {grantType === 'password' && (
        <>
          <div className={ROW}>
            <span className={LABEL}>Username</span>
            <TextInputView
              value={authData.oauth2Username || ''}
              onChange={(e) => onAuthDataChange({ ...authData, oauth2Username: e.target.value })}
              placeholder="username"
              size="md"
              accentColor={accentColor}
              style={W}
            />
          </div>
          <div className={ROW}>
            <span className={LABEL}>Password</span>
            <TextInputView
              value={authData.oauth2Password || ''}
              onChange={(e) => onAuthDataChange({ ...authData, oauth2Password: e.target.value })}
              placeholder="password"
              size="md"
              masked
              accentColor={accentColor}
              style={W}
            />
          </div>
        </>
      )}

      {/* Separator */}
      <div className="border-t border-[var(--color-border)] my-1" />

      {/* Access Token (result) */}
      <div className={ROW}>
        <span className={LABEL}>Access Token</span>
        <TextInputView
          value={authData.accessToken || ''}
          onChange={(e) => onAuthDataChange({ ...authData, accessToken: e.target.value })}
          placeholder="Token will appear here after fetching"
          size="md"
          masked
          accentColor={accentColor}
          style={W}
        />
      </div>

      {/* Get Token button */}
      <div className={ROW}>
        <span className={LABEL} />
        <button
          type="button"
          onClick={onGetToken}
          disabled={loading || !authData.oauth2TokenUrl || !authData.oauth2ClientId}
          className="h-[30px] px-3 text-[11px] font-medium rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 transition-opacity"
          style={{ backgroundColor: accentColor || 'var(--color-primary)', color: 'var(--color-btn-primary-text, #fff)' }}
        >
          <RefreshIcon size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Fetching...' : 'Get Token'}
        </button>
      </div>
    </div>
  );
}
