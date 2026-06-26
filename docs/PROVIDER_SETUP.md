# Glowbloom — Social Login Provider Setup

Real Google / Facebook / Apple sign-in needs OAuth credentials created in each
provider's console. Do these, send me the values listed under "GIVE ME", and I
wire both the web app and the Flutter app + server-side verification.

Domain in use: https://glowbloom.treeantstechnologies.com
App/bundle id:  com.treeants.glowbloom

We'll integrate in this order: 1) Google  2) Facebook  3) Apple.

==================================================================
## 1) GOOGLE  (start here — easiest, free)
==================================================================
1. Go to https://console.cloud.google.com → create a project "Glowbloom".
2. APIs & Services → OAuth consent screen:
   - User type: External → Create.
   - App name: Glowbloom · User support email: yours · Developer email: yours.
   - Scopes: add `email`, `profile`, `openid`. Save.
   - Add yourself as a Test user (until you publish the consent screen).
3. APIs & Services → Credentials → Create credentials → OAuth client ID:
   - **Web application** (for the web app):
     - Authorized JavaScript origins:
         https://glowbloom.treeantstechnologies.com
         http://localhost:4000
     - Authorized redirect URIs:
         https://glowbloom.treeantstechnologies.com
         http://localhost:4000
     - Create → copy the **Web client ID**.
   - (Later, for the mobile app) also create:
     - **Android** client: package `com.treeants.glowbloom` + your app's SHA-1.
     - **iOS** client: bundle id `com.treeants.glowbloom`.

   GIVE ME: the **Web client ID** (looks like `xxxx.apps.googleusercontent.com`).
   (Android/iOS client IDs later, when we do the mobile build.)

==================================================================
## 2) FACEBOOK / META
==================================================================
1. Go to https://developers.facebook.com → My Apps → Create App → type "Consumer".
2. Add product **Facebook Login** → Settings:
   - Valid OAuth Redirect URIs:
         https://glowbloom.treeantstechnologies.com/
   - App Domains: glowbloom.treeantstechnologies.com
3. Settings → Basic: copy **App ID** and **App Secret**.
4. To allow non-test users you must submit the app for review (later); during dev,
   add yourself/testers under App Roles.

   GIVE ME: **App ID** and **App Secret**.

==================================================================
## 3) APPLE  (requires a paid Apple Developer account, $99/yr)
==================================================================
1. https://developer.apple.com → Certificates, Identifiers & Profiles → Identifiers:
   - Create an **App ID**: `com.treeants.glowbloom`, enable "Sign in with Apple".
   - Create a **Services ID**: e.g. `com.treeants.glowbloom.web`, enable Sign in with
     Apple → Configure:
       - Domains: glowbloom.treeantstechnologies.com
       - Return URLs: https://glowbloom.treeantstechnologies.com/auth/apple/callback
2. Keys → create a **Sign in with Apple key** → download the `.p8` file (once only).
   Note the **Key ID**. Find your **Team ID** (top-right of the dev portal).

   GIVE ME: **Services ID**, **Team ID**, **Key ID**, and the **.p8 key file**.

==================================================================
## What I do once you send each one
==================================================================
- Web app: load the provider's JS SDK, get an ID token on button click, POST it to
  the backend `/auth/social`.
- Backend: verify the token with the provider (Google JWKS, Facebook debug_token,
  Apple JWKS), then create/login the user — already wired to `/auth/social`.
- Flutter app: add `google_sign_in` / `flutter_facebook_auth` / `sign_in_with_apple`,
  using the Android/iOS client IDs.

Start with Google: paste me the **Web client ID** and I'll make the Google button on
the web app actually sign people in.
