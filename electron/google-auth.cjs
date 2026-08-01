// Google OAuth "installed application" flow (RFC 8252) for a Desktop-app
// client: system browser + loopback HTTP redirect + PKCE. Desktop app clients
// are exempt from Google's loopback deprecation (that applies only to
// Android/iOS/Chrome-app clients), so this flow is expected to keep working.
const { shell, safeStorage, app } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { OAuth2Client } = require('google-auth-library');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
];

const tokenFile = () => path.join(app.getPath('userData'), 'google-tokens.bin');

function saveTokens(tokens) {
  const json = JSON.stringify(tokens);
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf8');
  fs.writeFileSync(tokenFile(), data);
}

function loadTokens() {
  let raw;
  try {
    raw = fs.readFileSync(tokenFile());
  } catch {
    return null;
  }
  try {
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function clearTokens() {
  try {
    fs.unlinkSync(tokenFile());
  } catch {
    /* nothing to remove */
  }
}

async function signIn() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env (see .env.example).'
    );
  }

  // Bind the loopback listener first so we know the real port before
  // building redirect_uri / the authorization URL.
  const server = http.createServer();
  await new Promise((res, rej) => {
    server.on('error', rej);
    server.listen(0, '127.0.0.1', res);
  });
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const oauth2Client = new OAuth2Client({ clientId, clientSecret, redirectUri });
  const { codeVerifier, codeChallenge } = await oauth2Client.generateCodeVerifierAsync();
  const state = Math.random().toString(36).slice(2);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
    prompt: 'consent'
  });

  const codePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timed_out')), 5 * 60 * 1000);
    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        err
          ? '<html><body>Sign-in failed. You can close this tab and return to Snugget Canvas.</body></html>'
          : '<html><body>Signed in — you can close this tab and return to Snugget Canvas.</body></html>'
      );
      clearTimeout(timeout);
      if (err) reject(new Error(err));
      else if (!code || returnedState !== state) reject(new Error('invalid_response'));
      else resolve(code);
    });
  });

  await shell.openExternal(authUrl);

  let code;
  try {
    code = await codePromise;
  } finally {
    server.close();
  }

  const { tokens } = await oauth2Client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
  saveTokens(tokens);
  return { connected: true };
}

function getStatus() {
  const tokens = loadTokens();
  return { connected: Boolean(tokens && (tokens.refresh_token || tokens.access_token)) };
}

function signOut() {
  clearTokens();
  return { connected: false };
}

module.exports = { signIn, getStatus, signOut, SCOPES };
