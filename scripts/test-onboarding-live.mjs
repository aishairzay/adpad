import assert from 'node:assert/strict';
import { init, createWalletClient } from '@bounded-sh/server';
import { Keypair } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../bounded.json', import.meta.url), 'utf8'));
assert.equal(config.protocol, 'realtime_offchain');
await init({ appId: config.appId, network: 'bounded-production' });
const creator = await createWalletClient({ keypair: JSON.stringify([...Keypair.generate().secretKey]) });
const requestId = crypto.randomUUID();
const args = { requestId, messages: [{ role: 'user', content: 'My name is Test Creator. I want to offer both wearing sponsor hats at Breakpoint and event photography. I have not decided my prices or availability yet.' }], draft: { offers: {} } };
const opts = { headers: { 'Idempotency-Key': requestId } };
const result = await creator.invoke('creatorOnboarding', args, opts);
assert.equal(typeof result.message, 'string');
assert.ok(result.draft.offers.placement);
assert.ok(result.draft.offers.service);
assert.equal(result.draft.offers.placement.priceMicro, undefined);
try {
  const replay = await creator.invoke('creatorOnboarding', args, opts);
  assert.deepEqual(replay, result);
} catch (error) {
  assert.equal(error.details?.code, 'invocation_replayed');
  assert.equal(error.details?.canonicalStatus, 200);
}

// Event-first flow: a chosen featured event pins the offer to its official window.
// Update these literals when the featured events change (functions/featured-events.ts).
const eventRequestId = crypto.randomUUID();
const eventArgs = { requestId: eventRequestId, messages: [{ role: 'user', content: 'My name is Event Creator. I want to offer ad space: I will wear a sponsor hoodie at Solana Breakpoint 2026. I have not decided my price yet.' }], draft: { offers: {} } };
const eventResult = await creator.invoke('creatorOnboarding', eventArgs, { headers: { 'Idempotency-Key': eventRequestId } });
const placement = eventResult.draft.offers.placement || {};
assert.equal(placement.eventId, 'breakpoint-2026');
assert.equal(placement.eventName, 'Solana Breakpoint 2026');
assert.equal(placement.startsAt, Date.parse('2026-11-15T16:00:00.000Z') / 1000);
assert.equal(placement.endsAt, Date.parse('2026-11-17T19:00:00.000Z') / 1000);
assert.equal(placement.supplyBy, undefined);
console.log(JSON.stringify({ nonOwner: 'passed', bothOffers: 'passed', noInventedPrice: 'passed', duplicateSuppressed: 'passed', eventWindowFilled: 'passed', response: result, eventResponse: eventResult }));
