import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { init, createWalletClient } from '@bounded-sh/server';
import { serverTimestamp } from '@bounded-sh/core';
import { Keypair } from '@solana/web3.js';

if (process.argv.includes('--help')) {
  console.log('After deploying the attendance policy, run: node scripts/test-event-attendance-integration.mjs\nUses ephemeral identities kept only in memory. Creates and retires one integration_ listing. No escrow, booking-offer or payment writes.');
  process.exit(0);
}

const config = JSON.parse(readFileSync(new URL('../bounded.json', import.meta.url), 'utf8'));
assert.equal(config.protocol, 'realtime_offchain', 'Attendance integration requires this project to remain on Poofnet');
assert.ok(config.appId);
const evidence = [];
let phase = 'initialize';
let listingPath;
let confirmedCreated = false;
let confirmedRetired = false;

function safeMessage(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]')
    .replace(/("?(?:accessToken|idToken|refreshToken|secretKey|privateKey|authorization)"?\s*[:=]\s*)[^,\s}]+/gi, '$1[redacted]')
    .replace(/[\r\n]+/g, ' ').slice(0, 300);
}

async function mustDeny(operation, check) {
  try { await operation(); }
  catch (error) {
    const message = safeMessage(error);
    assert.match(message, /\b403\b|denied|forbidden|not allowed/i, `${check}: expected a policy denial`);
    assert.doesNotMatch(message, /\b400\b|not defined|not a function/i, `${check}: validation errors cannot prove authorization`);
    evidence.push({ check, result: 'policy denied' });
    return;
  }
  throw new Error(`${check}: unexpectedly allowed`);
}

try {
  await init({ appId: config.appId, network: config.environment === 'staging' ? 'bounded-staging' : 'bounded-production' });
  const makeClient = () => createWalletClient({ keypair: JSON.stringify([...Keypair.generate().secretKey]) });
  const owner = await makeClient();
  const outsider = await makeClient();
  // Decode identity claims from this session only; never log or persist its token.
  const token = await owner.getIdToken();
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims['custom:walletAddress'], owner.address);
  assert.equal(claims['custom:appId'], config.appId);
  const ownerId = claims['custom:userId'];
  assert.ok(typeof ownerId === 'string' && ownerId.length > 0 && !ownerId.includes('/'));
  const startsAt = Math.floor(Date.now() / 1000) + 86400;
  const fields = {
    owner: ownerId, seller: owner.address, publisher: 'Ad Pad integration test',
    title: 'Attendance policy integration test', kind: 'placement', category: 'T-shirts', channel: 'Test harness',
    description: 'Automated fixture; no real event attendance or ad space is offered.',
    deliverables: 'No actual advertising or attendance obligations.', audience: 'No real audience',
    priceMicro: 1000000, turnaroundDays: 2, active: true, createdAt: serverTimestamp(),
    attendingEvent: true, eventId: 'integration_event', eventName: 'Integration fixture event', startsAt, endsAt: startsAt + 3600,
  };
  const fresh = label => `listings/integration_attendance_${label}_${randomUUID().replaceAll('-', '_')}`;
  phase = 'reject service attendance';
  await mustDeny(() => owner.set(fresh('service'), { ...fields, kind: 'service' }), phase);
  phase = 'reject attendance without event identity';
  await mustDeny(() => owner.set(fresh('no_event'), { ...fields, eventId: null, eventName: null }), phase);
  phase = 'reject attendance without event dates';
  await mustDeny(() => owner.set(fresh('no_dates'), { ...fields, startsAt: null, endsAt: null }), phase);
  phase = 'create owner attendance declaration';
  listingPath = fresh('valid');
  await owner.set(listingPath, fields);
  confirmedCreated = true;
  phase = 'public roundtrip';
  const actual = await outsider.get(listingPath, { bypassCache: true });
  for (const [key, value] of Object.entries(fields)) if (key !== 'createdAt') assert.equal(actual[key], value, key);
  assert.ok(Number.isInteger(actual.createdAt) && actual.createdAt > 0, 'Server timestamp resolves to Unix seconds');
  evidence.push({ check: 'owned placement with self-reported attendance and valid event dates persists and is publicly readable', result: 'passed' });
  phase = 'reject outsider attendance withdrawal';
  await mustDeny(() => outsider.set(listingPath, { attendingEvent: false }), phase);
  phase = 'reject invalid attendance edit';
  await mustDeny(() => owner.set(listingPath, { eventId: '' }), phase);
  phase = 'retire test listing';
  await owner.set(listingPath, { active: false, attendingEvent: false });
  const retired = await outsider.get(listingPath, { bypassCache: true });
  assert.equal(retired.active, false);
  assert.equal(retired.attendingEvent, false);
  confirmedRetired = true;
  evidence.push({ check: 'owner can withdraw attendance and retire own listing', result: 'passed' });
  console.log(JSON.stringify({ ok: true, appId: config.appId, protocol: config.protocol, listingPath, confirmedCreated, confirmedRetired, evidence, retained: 'One inactive integration_ listing with attendance withdrawn. Ephemeral credentials were never persisted. No booking, escrow or payment writes.' }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, appId: config.appId, phase, message: safeMessage(error), listingPath, confirmedCreated, confirmedRetired, evidence, recovery: 'Inspect the exact listing path before any retry. The script does not retry ambiguous writes.' }, null, 2));
  process.exitCode = 1;
}
