# Placement Drive Board

A Firebase-backed placement drive board for students.

## Deploy on Netlify with GitHub

1. Create a new GitHub repository.
2. Upload or push this folder's files to that repository.
3. In Netlify, choose Add new site > Import an existing project.
4. Connect GitHub and select the repository.
5. Leave the build command empty.
6. Set publish directory to `.`
7. Deploy.

## Firebase after deployment

After Netlify gives you a live URL:

1. Open Firebase Console.
2. Go to Authentication > Settings > Authorized domains.
3. Add your Netlify domain, for example `your-site.netlify.app`.
4. Make sure Google sign-in is enabled.
5. Make sure Firestore rules allow signed-in users to read and only your admin email to write.

## Config

Put Firebase web app details in `firebase-config.js`.

Do not commit private server secrets. The Firebase web config is okay to include in frontend code, but your Gemini API key should only be used for local testing until a backend is added.
