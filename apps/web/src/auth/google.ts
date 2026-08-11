import { useEffect, useRef, useState } from 'react';
import { googleClientId } from '../api';

// Minimal Google Identity Services typing (we only use accounts.id).
interface GsiCredentialResponse {
  credential: string;
}
interface GsiId {
  initialize(cfg: { client_id: string; callback: (r: GsiCredentialResponse) => void }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GsiId } };
  }
}

const SRC = 'https://accounts.google.com/gsi/client';

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gsi_load_failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gsi_load_failed'));
    document.head.appendChild(s);
  });
}

/**
 * Renders a Google Sign-In button into `ref` and invokes `oncredential` with the
 * returned ID token (aud = web client id → POST /v1/auth/google). No-ops when no
 * client id is configured.
 */
export function useGoogleButton(
  ref: React.RefObject<HTMLDivElement | null>,
  onCredential: (idToken: string) => void,
  theme: 'light' | 'dark',
): { enabled: boolean } {
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;
  const [enabled] = useState(Boolean(googleClientId));

  useEffect(() => {
    const clientId = googleClientId;
    if (!clientId || !ref.current) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => cbRef.current(r.credential),
        });
        ref.current.innerHTML = '';
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 280,
        });
      })
      .catch(() => {
        /* button just won't render; other sign-in paths remain */
      });
    return () => {
      cancelled = true;
    };
  }, [ref, theme]);

  return { enabled };
}
