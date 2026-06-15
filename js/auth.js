// Microsoft-login via MSAL (redirect-flow — betrouwbaar in een geïnstalleerde PWA).
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
} from "https://cdn.jsdelivr.net/npm/@azure/msal-browser@5.13.0/+esm";
import { msalConfig, graphScopes } from "./config.js";

const msal = new PublicClientApplication(msalConfig);
let initialized = false;

// Initialiseert MSAL en verwerkt een eventuele terugkeer van de login-redirect.
export async function initAuth() {
  if (initialized) return msal;
  await msal.initialize();
  const response = await msal.handleRedirectPromise();
  if (response && response.account) {
    msal.setActiveAccount(response.account);
  } else {
    const existing = getAccount();
    if (existing) msal.setActiveAccount(existing);
  }
  initialized = true;
  return msal;
}

export function getAccount() {
  const accounts = msal.getAllAccounts();
  return accounts.length ? accounts[0] : null;
}

// Start de login. De pagina navigeert weg naar Microsoft en komt daarna terug.
export async function signIn() {
  await initAuth();
  await msal.loginRedirect({ scopes: graphScopes, prompt: "select_account" });
}

export async function signOut() {
  await initAuth();
  await msal.logoutRedirect({ account: getAccount() });
}

// Haalt een geldig toegangstoken op (ververst stil; vraagt opnieuw login indien nodig).
export async function getToken() {
  await initAuth();
  const account = getAccount();
  if (!account) throw new Error("Niet ingelogd");
  try {
    const res = await msal.acquireTokenSilent({ scopes: graphScopes, account });
    return res.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await msal.acquireTokenRedirect({ scopes: graphScopes, account });
      return; // pagina redirect; rest volgt na terugkeer
    }
    throw e;
  }
}
