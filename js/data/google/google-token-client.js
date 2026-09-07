import { GOOGLE_SCOPE } from '../../core/google-calendar.js';
let loading;
export class GoogleTokenClient {
  #token = null; #expires = 0; #profile = null;
  valid(profileId) { return this.#profile === profileId && !!this.#token && Date.now() + 30000 < this.#expires; }
  token(profileId) { if (!this.valid(profileId)) throw new Error('AUTH_REQUIRED'); return this.#token; }
  clear() { this.#token = null; this.#expires = 0; this.#profile = null; }
  prepare() {
    if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
    if (!loading) loading = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
      const timer = setTimeout(() => { script.remove(); reject(new Error('OAUTH_FAILED')); }, 15000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('OAUTH_FAILED')); };
      document.head.append(script);
    }).catch((error) => { loading = null; throw error; });
    return loading;
  }
  authorize(profileId, clientId) {
    this.clear();
    if (!clientId) return Promise.reject(new Error('CLIENT_ID_REQUIRED'));
    if (!globalThis.google?.accounts?.oauth2) return Promise.reject(new Error('OAUTH_FAILED'));
    // Called directly by the second button gesture, after prepare; no await before popup.
    return new Promise((resolve, reject) => {
      const client = globalThis.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: GOOGLE_SCOPE,
        include_granted_scopes: false,
        callback: (response) => {
          if (response.error || !response.access_token || !globalThis.google.accounts.oauth2.hasGrantedAllScopes(response, GOOGLE_SCOPE)) return reject(new Error('OAUTH_FAILED'));
          this.#token = response.access_token; this.#expires = Date.now() + Number(response.expires_in) * 1000; this.#profile = profileId; resolve();
        }, error_callback: () => reject(new Error('OAUTH_FAILED')) });
      client.requestAccessToken({ prompt: 'select_account' });
    });
  }
}
