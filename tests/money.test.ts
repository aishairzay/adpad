import { describe, expect, it } from 'vitest';
import { parseUsdc, receiptState, validateProofUrl } from '../src/lib/money';

describe('USDC amounts', () => {
  it('converts amounts to exact integer base units', () => {
    expect(parseUsdc('0.000001')).toBe(1);
    expect(parseUsdc('123.456789')).toBe(123456789);
    expect(parseUsdc('0.29')).toBe(290000);
  });
  it.each(['0', '-1', '1e6', '1.0000001', 'Infinity', '1,000', '', '9007199254740991'])('refuses unsafe input %s', value => {
    expect(() => parseUsdc(value)).toThrow();
  });
});

describe('escrow receipt confirmation', () => {
  it('never treats persistence or a transaction ID as payment success', () => {
    expect(receiptState(null)).toBe('pending');
    expect(receiptState({})).toBe('pending');
    expect(receiptState({ _transaction_hash: 'tx' })).toBe('pending');
    expect(receiptState({ _transaction_hash: 'tx', _hook_completed: 'old_tx' })).toBe('pending');
  });
  it('requires matching confirmation and gives failures precedence', () => {
    expect(receiptState({ _transaction_hash: 'tx', _hook_completed: 'tx' })).toBe('complete');
    expect(receiptState({ _transaction_hash: 'tx', _hook_completed: 'tx', _error_message: 'failed' })).toBe('failed');
  });
});

describe('public delivery evidence', () => {
  it.each(['javascript:alert(1)', 'http://example.com', 'https://user:password@example.com'])('rejects %s', value => {
    expect(() => validateProofUrl(value)).toThrow();
  });
  it('accepts public HTTPS links', () => expect(validateProofUrl('https://example.com/proof')).toBe('https://example.com/proof'));
});
