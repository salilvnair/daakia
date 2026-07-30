/** Derive implicit Authorization / Cookie headers from the current auth config. */
export function computeAuthRows(
  authType: string,
  authData: Record<string, string>,
): { key: string; value: string }[] {
  if (authType === 'bearer' && authData.token) {
    return [{ key: 'Authorization', value: `Bearer ${authData.token}` }];
  }
  if (authType === 'basic' && authData.username) {
    const encoded = btoa(`${authData.username}:${authData.password || ''}`);
    return [{ key: 'Authorization', value: `Basic ${encoded}` }];
  }
  if (authType === 'api-key' && authData.apiKeyName && (!authData.addTo || authData.addTo === 'header')) {
    return [{ key: authData.apiKeyName, value: authData.apiKeyValue || '' }];
  }
  if (authType === 'oauth2' && authData.accessToken) {
    return [{ key: 'Authorization', value: `Bearer ${authData.accessToken}` }];
  }
  return [];
}
