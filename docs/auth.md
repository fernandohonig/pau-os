# Authentication & Google Sign-In setup

pau-os is **anonymous-first** (spec §20/§23): the diagnostic needs no login.
Google Sign-In adds an optional persistent identity and gates admin access.
This doc explains how to generate the values the app and API need from a Google
Cloud (GCP) project.

## The flow

1. The app obtains a Google **ID token** using the platform's OAuth client ID
   (Web on web, iOS/Android client ID in native builds).
2. It calls `POST /v1/auth/google` with that token.
3. The API verifies the token against the set of configured audiences
   (`services/api/src/auth.ts`) — public-key based, so no client *secret* is
   needed.
4. The API issues its own signed session JWT (`JWT_SECRET`, 30-day TTL). Google's
   ID token is never stored.

A Google ID token's `aud` claim is the client ID that requested it, which
**differs per platform**: web tokens carry the Web client ID, native tokens
carry the iOS/Android client ID. The API therefore accepts any configured client
ID as a valid audience (`GOOGLE_CLIENT_ID` + `GOOGLE_IOS_CLIENT_ID` +
`GOOGLE_ANDROID_CLIENT_ID`). For web-only testing, `GOOGLE_CLIENT_ID` alone is
enough.

## Variables

| Variable | Where | Source |
|---|---|---|
| `GOOGLE_CLIENT_ID` | API env | OAuth **Web** client ID from GCP |
| `GOOGLE_IOS_CLIENT_ID` | API env | OAuth **iOS** client ID (native builds) |
| `GOOGLE_ANDROID_CLIENT_ID` | API env | OAuth **Android** client ID (native builds) |
| `extra.googleClientId` | mobile `apps/mobile/app.json` | same Web client ID |
| `extra.googleIosClientId` | mobile `apps/mobile/app.json` | same iOS client ID |
| `extra.googleAndroidClientId` | mobile `apps/mobile/app.json` | same Android client ID |
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
- The generated **Client ID** is both `GOOGLE_CLIENT_ID` and
  `extra.googleClientId`. No client secret is required for this flow.

**Redirect URIs (web).** On web, `expo-auth-session` redirects back to the page
origin, so register the exact origin under **Authorized redirect URIs** *and*
**Authorized JavaScript origins**. For local dev that is `http://localhost:8081`
(the Expo web / Metro port — match whatever Metro prints). Google matches
exactly: no trailing-slash or port mismatch. A `redirect_uri_mismatch` error
means the value the app sent isn't registered here — copy the `redirect_uri=`
param from the browser URL and add it verbatim.

> The legacy `https://auth.expo.io/@<expo-username>/pau-os` proxy URL is
> deprecated in recent Expo SDKs — avoid it for new setups.

### 4. iOS / Android OAuth clients (native builds)
Native `expo-auth-session` uses a platform client ID, and its ID token's `aud`
is that client ID — which is why the API accepts iOS/Android audiences (step 3
of "The flow"). The app's identifiers are `bundleIdentifier` / `package` =
`app.pauos.mobile` (`apps/mobile/app.json`).

Create two more OAuth clients (Credentials → Create credentials → OAuth client
ID):
- **iOS**: bundle ID `app.pauos.mobile`. No secret; the redirect is the
  reversed-client-id URL scheme, which Expo configures from this client during
  prebuild. → `GOOGLE_IOS_CLIENT_ID` + `extra.googleIosClientId`.
- **Android**: package `app.pauos.mobile` + the **SHA-1** signing fingerprint of
  your build (`eas credentials`, or `keytool -list` on the keystore). →
  `GOOGLE_ANDROID_CLIENT_ID` + `extra.googleAndroidClientId`.

Native Google sign-in needs a **dev client / prebuild** (`npx expo prebuild`),
not Expo Go — the custom scheme must be compiled into the app. Add the platform
client IDs to both the API env (so their tokens verify) and `app.json` (so the
app requests them).

## Wiring it up

API env (`.env`, see `.env.example`):
```bash
GOOGLE_CLIENT_ID=1234567890-web.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=1234567890-ios.apps.googleusercontent.com          # native only
GOOGLE_ANDROID_CLIENT_ID=1234567890-android.apps.googleusercontent.com  # native only
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_EMAILS=you@example.com,other-admin@example.com
AUTH_DEV_LOGIN=false            # in production; leave unset in dev
```

Mobile (`apps/mobile/app.json`):
```json
"extra": {
  "apiBaseUrl": "http://localhost:3000",
  "googleClientId": "1234567890-web.apps.googleusercontent.com",
  "googleIosClientId": "1234567890-ios.apps.googleusercontent.com",
  "googleAndroidClientId": "1234567890-android.apps.googleusercontent.com"
}
```

See [api.md](api.md#authentication) for the auth endpoints.
