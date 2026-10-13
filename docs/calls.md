# Sponsor calls

A call is a sponsor saying what they want promoted, where and by when, with the USDC locked before any creator is named.
Creators respond; the sponsor picks one; the pick becomes an ordinary booking.

## The flow

1. The sponsor's wallet creates `dealEscrows/<escrowId>` with no payee and, as its ref, the id of the booking a pick will create (`deal_` plus 32 hex characters).
2. The sponsor creates `sponsorCalls/<callId>` (`call_` plus 32 hex characters) with status `funding`, naming that escrow and that booking id.
   The rules accept it only if the escrow is the sponsor's, unfunded, has no payee, and matches the call's amount, expiry and booking id.
3. The sponsor runs fund, then sets the call `open`; the rules accept that only once the escrow is locked with no payee.
4. Creators other than the sponsor, with a linked X account, respond under `sponsorCalls/<callId>/responses/<their wallet>` while the call is open and before its deadline: a pitch of 10 to 500 characters and an optional link.
   Only the responder and the call's sponsor can read a response.
5. The sponsor picks one response:
   - creates `sponsorDeals/<the booking id>` for that creator, with the call's title as headline, its brief, amount, deadline and expiry, and the call's id as `listingId` (the rules accept it only from the call's sponsor, while the call is open, for a creator who responded, on exactly those terms);
   - saves the call's escrowId on the booking, as for any lock;
   - runs assign on the escrow with the creator as payee;
   - sets the call `picked` with `creator`, which the rules accept only when the escrow's payee is a creator who responded and the booking exists with that creator and escrow;
   - writes a `funding_sent` request.
6. From there it is a booking: the agent checks the escrow (locked or accepted, funder is the sponsor, payee is the creator, amount matches, ref is the booking id) and marks it funded, the creator accepts, sends proof, and the sponsor pays from the escrow.
7. Before a pick, the sponsor can take the USDC back with withdraw and set the call `closed`.
   A call whose USDC was never locked can be closed at any time.

## For the agent

Calls ring nobody; the booking a pick creates rings the agent through its `funding_sent` request, and is handled like any booking.
A booking from a call has a `listingId` that starts with `call_`: it takes no listing spot, and its public `dealRecords` entry carries that call id.
The agent may close a call (status `closed`) whose escrow went back to the sponsor or was never locked.
