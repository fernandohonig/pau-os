# Authentication & Google Sign-In setup

pau-os is **anonymous-first** (spec §20/§23): the diagnostic needs no login.
Google Sign-In adds an optional persistent identity and gates admin access. The
app is **web-only** — Google sign-in uses Google Identity Services (GIS) in the
browser.

## The flow

1. The web app (`apps/web`) loads Google Identity Services and obtains a Google
   **ID token** for the **Web** OAuth client id.
2. It calls `POST /v1/auth/google` with that token.
3. The API verifies the token against `GOOGLE_CLIENT_ID`
   (`services/api/src/auth.ts`) — public-key based, so no client *secret* is needed.
4. The API issues its own signed session JWT (`JWT_SECRET`, 30-day TTL). Google's
   ID token is never stored.

## Variables

| Variable | Where | Source |
|---|---|---|
| `GOOGLE_CLIENT_ID` | API env (`.env`) | OAuth **Web** client ID from GCP |
| `VITE_GOOGLE_CLIENT_ID` | web env (`apps/web/.env.local`) | same Web client ID |
| `VITE_API_BASE_URL` | web env | API base URL (default `http://localhost:3000`) |
| `JWT_SECRET` | API env | `openssl rand -hex 32` (not from GCP) |
| `ADMIN_EMAILS` | API env | comma-separated admin allowlist (not from GCP) |
| `AUTH_DEV_LOGIN` | API env | `true`/`false`; off in production |
| `CORS_ORIGINS` | API env | browser origins allowed to call the API |

Leaving `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` unset keeps Google auth off:
the app hides the button and the server rejects Google tokens — dev login still
works locally.

## Generating the values in GCP

### 1. Project
```bash
gcloud projects create pau-os-auth        # or reuse an existing project
gcloud config set project pau-os-auth
```
ID-token sign-in needs no extra API enabled.

### 2. OAuth consent screen
Console → APIs & Services → OAuth consent screen:
- User type: **External**
- App name, support email, developer contact email
- Scopes: `openid`, `email`, `profile` (the code only reads `email`)
- Add yourself + testers under **Test users** while status is "Testing"

### 3. Web OAuth client → this is `GOOGLE_CLIENT_ID`
Console → APIs & Services → Credentials → Create credentials → OAuth client ID:
- Application type: **Web application**
- **Authorized JavaScript origins**: add the app origin — `http://localhost:5173`
  for dev (Vite), plus your deployed origin in production. Google matches exactly
  (scheme + host + port; no trailing slash).
- GIS uses the origins allowlist, not redirect URIs, so **Authorized redirect
  URIs** can be left empty for this flow.
- The generated **Client ID** is both `GOOGLE_CLIENT_ID` (API) and
  `VITE_GOOGLE_CLIENT_ID` (web). **No client secret is required.**

## Wiring it up

API env (`.env`, see `.env.example`):
```bash
GOOGLE_CLIENT_ID=1234567890-web.apps.googleusercontent.com
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_EMAILS=you@example.com,other-admin@example.com
AUTH_DEV_LOGIN=false            # in production; leave unset in dev
CORS_ORIGINS=http://localhost:5173
```

Web env (`apps/web/.env.local`, see `apps/web/.env.example`):
```bash
VITE_API_BASE_URL=http://localhost:3000
VITE_GOOGLE_CLIENT_ID=1234567890-web.apps.googleusercontent.com
```

See [api.md](api.md#authentication) for the auth endpoints.
