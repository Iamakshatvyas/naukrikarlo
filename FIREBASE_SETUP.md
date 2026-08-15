# Firebase Setup

The key from Google AI Studio is only for the AI summary. It is not the Firebase config.

1. Create a Firebase project.
2. Add a Web app in Project settings.
3. Copy the web app config into `firebase-config.js`.
4. In Authentication, enable Google as a sign-in provider.
5. In Firestore Database, create a database.
6. Replace `your.email@gmail.com` in `firebase-config.js` with your Google email.
7. Add your hosted domain in Authentication > Settings > Authorized domains.

## Gemini AI Key

Use Google AI Studio only for the placement summary AI key. Paste that key inside the website's AI settings after you sign in as admin. If the key appeared in a screenshot or chat, delete it and create a new one before using it.

For local testing with this file URL, Google popup sign-in may be blocked by browser/Firebase domain rules. If that happens, host the folder with Firebase Hosting, Vercel, Netlify, or a simple local server.

## Firestore Rules

Use this first version to let signed-in students read placement drives while only your email can write.

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return request.auth != null
        && request.auth.token.email in [
          "your.email@gmail.com"
        ];
    }

    match /placementDrives/{driveId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isAdmin();
    }
  }
}
```
