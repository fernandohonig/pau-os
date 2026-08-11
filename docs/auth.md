# Authentication & Google Sign-In setup

pau-os is **anonymous-first** (spec §20/§23): the diagnostic needs no login.
Google Sign-In adds an optional persistent identity and gates admin access.
This doc explains how to generate the values the app and API need from a Google
Cloud (GCP) project.

## The flow

1. The mobile app obtains a Google **ID token** using the OAuth Web client ID.
2. It calls `POST /v1/auth/google` with that token.
3. The API verifies the token with `audience: GOOGLE_CLIENT_ID`
   (`services/api/src/auth.ts`) — public-key based, so no client *secret* is
   needed.
4. The API issues its own signed session JWT (`JWT_SECRET`, 30-day TTL). Google's
   ID token is never stored.

Because the API verifies against a **single** audience, the app's client ID and
the server's `GOOGLE_CLIENT_ID` must be the **same value** — the **Web OAuth
client ID**. Native SDKs mint ID tokens whose `aud` is the Web client ID (Expo's
`expo-auth-session` and `@react-native-google-signin`'s `webClientId`), so one
value covers every platform.

## Variables

| Variable | Where | Source |
|---|---|---|
| `GOOGLE_CLIENT_ID` | API env | OAuth **Web** client ID from GCP |
| `extra.googleClientId` | mobile `apps/mobile/app.json` | same Web client ID |
| `JWT_SECRET` | API env | `openssl rand -hex 32` (not from GCP) |
| `ADMIN_EMAILS` | API env | comma-separated admin allowlist (not from GCP) |
| `AUTH_DEV_LOGIN` | API env | `true`/`false`; off in production |

Leaving `GOOGLE_CLIENT_ID` / `extra.googleClientId` unset keeps Google auth off:
the app hides the button (`apps/mobile/src/api.ts`) and the server rejects
Google tokens — dev login still works.

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
- For Expo dev with `expo-auth-session`, add its redirect URI
  (e.g. `https://auth.expo.io/@<expo-username>/pau-os`, or your proxy URI)
- The generated **Client ID** is both `GOOGLE_CLIENT_ID` and
  `extra.googleClientId`. No client secret is required for this flow.

### 4. (Native builds only) iOS / Android OAuth clients
If you ship standalone builds via `@react-native-google-signin`, also create
**iOS** and **Android** OAuth client IDs (Android needs your SHA-1 signing
fingerprint + package name). Still pass the **Web** client ID as `webClientId`
so the ID token's `aud` matches the server. These platform client IDs do **not**
go into pau-os env — they only let Google issue the token.

## Wiring it up

API env (`.env`, see `.env.example`):
```bash
GOOGLE_CLIENT_ID=1234567890-abcdef.apps.googleusercontent.com
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_EMAILS=you@example.com,other-admin@example.com
AUTH_DEV_LOGIN=false            # in production; leave unset in dev
```

Mobile (`apps/mobile/app.json`, same Web client ID):
```json
"extra": {
  "apiBaseUrl": "http://localhost:3000",
  "googleClientId": "1234567890-abcdef.apps.googleusercontent.com"
}
```

See [api.md](api.md#authentication) for the auth endpoints.
