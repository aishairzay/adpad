// Identity of this app. The main network app is 605ba9048f556bdd2b7ea18e;
// previews are separate apps on the simulated network with their own ids.
// Preview builds set VITE_APP_ID (the sign-in helper refuses bundles that
// name the main app, and every data call 403s on the preview origin);
// the live build leaves it unset and falls back to the main app below.
export const APP_ID = import.meta.env.VITE_APP_ID || '605ba9048f556bdd2b7ea18e';
export const ADMIN_WALLET = '2z4wE2an8YRR6w4AMT2EaBTygheSixBE5Cf2YZfdaj1X';
export const AGENT_WALLET = 'B9bQJmvkY6mL9HcRkqkP3eMahbgzgentzhpXC7MoDXrx';
export const NETWORK = 'bounded-production' as const;

// The live app runs on Solana mainnet: onchain writes (publishing a listing,
// funding an escrow) are submitted by the SDK, which needs the chain at init.
// A release publishes the preview's own bundle, so build-time flags cannot
// tell live from preview. Decide at runtime from the page's host instead.
// With chain set and no rpcUrl, the SDK uses Bounded's platform mainnet RPC.
export const LIVE_HOSTS = new Set(['adpad.fyi', 'adpad-wugc.openapps.xyz']);
