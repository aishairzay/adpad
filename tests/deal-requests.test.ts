import { describe, expect, it } from 'vitest';
import { allowedRequests, dealRequestWrites, validateRequestNote } from '../src/lib/deal-requests';
import type { SponsorDeal } from '../src/lib/sponsor-deals';

const deal = (status: string, deadline = 1000) => ({ id: 'deal_1', sponsor: 'S', creator: 'C', status, deadline }) as unknown as SponsorDeal;

describe('deal requests', () => {
  it('lets the sponsor report a funded escrow only while awaiting funding, once the escrow id is saved', () => {
    expect(allowedRequests(deal('awaiting_funding'), 'S', 10)).toEqual([]);
    expect(allowedRequests({ ...deal('awaiting_funding'), escrowId: 'b'.repeat(32) }, 'S', 10)).toEqual(['funding_sent']);
    expect(validateRequestNote('dispute_sent', '')).not.toBeNull();
    expect(allowedRequests(deal('awaiting_funding'), 'C', 10)).toEqual([]);
  });
  it('offers no refund request after the deadline: a missed deadline is disputed on the escrow', () => {
    expect(allowedRequests(deal('funded', 1000), 'S', 999)).toEqual(['concern']);
    expect(allowedRequests(deal('funded', 1000), 'S', 1001)).toEqual(['concern']);
  });
  it('lets either party flag a concern before settlement, nobody else', () => {
    expect(allowedRequests(deal('in_review'), 'C', 10)).toEqual(['concern']);
    expect(allowedRequests(deal('released'), 'C', 10)).toEqual([]);
    expect(allowedRequests(deal('funded'), 'X', 10)).toEqual([]);
  });
  it('requires a real concern note', () => {
    expect(validateRequestNote('concern', 'short')).toMatch(/10 characters/);
    expect(validateRequestNote('concern', 'The post came down after an hour.')).toBeNull();
    expect(validateRequestNote('missed_deadline', '')).toBeNull();
  });
  it('writes the request with its rate receipt', () => {
    const writes = dealRequestWrites({ requestId: 'req_1', kind: 'concern', deal: deal('funded'), address: 'S', userId: 'u1', note: ' hi there friend ', createdAt: 5 });
    expect(writes.map(w => w.path)).toEqual(['dealRequests/req_1', 'dealRequestRate/u1/r/req_1']);
    expect(writes[0].document).toMatchObject({ status: 'pending', note: 'hi there friend', dealId: 'deal_1', raisedBy: 'S' });
  });
});
