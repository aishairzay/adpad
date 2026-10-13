# Ad Pad

P2P ad placement marketplace, built with Bounded. Owner: maurice@poof.new.
Regular Bounded app, not an OpenApps oApp.

- Use the latest stable Bounded CLI and SDK; check the registry before an upgrade. Read the installed Bounded skill and the focused backend, frontend, or onchain reference.
- Initial deployment protocol is `realtime_offchain` (Poofnet). All tokens are simulated. Keep that distinction visible in the app. Mainnet is a separate release that requires explicit authorization and actual target-network testing.
- Each booking or call has its own escrow (`dealEscrows`): one USDC account at a public Solana address. USDC amounts are safe integer micro-units. The sponsor locks the USDC and can take it back until the creator accepts; the sponsor pays the creator from the escrow once the proof matches, and the creator can return it. Either side can dispute after acceptance, and only AdPad's agent decides, through an approved data script. See docs/escrow.md and docs/calls.md.
- Never infer payment success from a saved receipt. Require the successful hook marker and the expected authoritative head state. Do not automatically retry ambiguous payment actions.
- `policy.json` is the policy source; edit it directly. Run policy allow/deny tests, application tests, and the production build before deployment.
- Each preview is a separate app with its own id. Build the client with `VITE_APP_ID=<previewId> npm run build` so the bundle speaks to that preview's own data, and deploy with `--app-id <previewId>`. Backend functions declared in policy.json are not copied to previews: deploy each with `bounded functions deploy <name> --entry functions/<name>.ts --app-id <previewId> --auth "@user.id != null" --json`.
- Keep public listing descriptions separate from authoritative escrow terms. Do not weaken policy to accommodate a UI error. Campaign terms and evidence are public; show that before submission.
- Do not put session tokens, wallet keys, or provider secrets in source, logs, frontend builds, or source sync.

Automatic approval review required explicit user approval to transmit the unpublished policy to `platform.bounded.sh`. Honor the approval granted in the current conversation; do not infer approval from this file.
