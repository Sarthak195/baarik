import { describe, expect, it } from 'vitest';

import { findConflictingQuantities } from '@/core/consistency/quantities';

import { contract } from './helpers';

describe('findConflictingQuantities', () => {
  it('flags a notice period of thirty days in clause 7 and sixty days in clause 12', () => {
    const document = contract(
      '7. TERMINATION',
      'Either party may terminate this Agreement by giving thirty (30) days notice in writing.',
      '',
      '12. EXIT',
      'The Employee shall serve notice of sixty (60) days before leaving the Company.',
    );

    const findings = findConflictingQuantities(document);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('conflicting_quantity');
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.at.segmentLabel).toBe('12');
    expect(findings[0]?.counterpart?.segmentLabel).toBe('7');
    expect(findings[0]?.title).toContain('notice period');
  });

  it('names both clauses and the text of both values in the detail', () => {
    const document = contract(
      '7. TERMINATION',
      'Either party may terminate by giving thirty (30) days notice.',
      '',
      '12. EXIT',
      'The Employee shall give notice of sixty (60) days.',
    );

    const detail = findConflictingQuantities(document)[0]?.detail ?? '';

    expect(detail).toContain('clause 7');
    expect(detail).toContain('clause 12');
    expect(detail).toContain('thirty (30) days');
    expect(detail).toContain('sixty (60) days');
  });

  it('warns that a differing notice period may be a deliberate asymmetry between the parties', () => {
    // Kept rather than suppressed: an employer month against an employee quarter is
    // exactly the imbalance a reader should see, whether or not it was intended.
    const document = contract(
      '7. TERMINATION',
      'The Company may terminate on notice of thirty (30) days.',
      '',
      '12. RESIGNATION',
      'The Employee shall give notice of ninety (90) days.',
    );

    expect(findConflictingQuantities(document)[0]?.detail).toContain('deliberate');
  });

  it('treats one month and thirty days as the same period', () => {
    const document = contract(
      '7. TERMINATION',
      'Either party may terminate this Agreement on one month notice.',
      '',
      '12. EXIT',
      'The Employee shall give thirty (30) days notice before leaving.',
    );

    expect(findConflictingQuantities(document)).toEqual([]);
  });

  it('flags a security deposit stated as two different amounts', () => {
    const document = contract(
      '3. DEPOSIT',
      'The Tenant shall pay a security deposit of Rs. 50,000 on execution.',
      '',
      '9. REFUND',
      'The security deposit of Rs. 75,000 shall be refunded on vacating the premises.',
    );

    const findings = findConflictingQuantities(document);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('security deposit');
  });

  it('does not pair a deposit amount with a rent amount', () => {
    const document = contract(
      '3. RENT',
      'The monthly rent is Rs. 20,000 payable in advance.',
      '',
      '4. DEPOSIT',
      'The security deposit is Rs. 40,000 refundable on vacating.',
    );

    expect(findConflictingQuantities(document)).toEqual([]);
  });

  it('does not pair a duration with a sum of money for the same concept', () => {
    const document = contract(
      '3. DEPOSIT',
      'The security deposit is Rs. 40,000.',
      '',
      '9. REFUND',
      'The security deposit shall be refunded within thirty (30) days of vacating.',
    );

    expect(findConflictingQuantities(document)).toEqual([]);
  });

  it('does not report a second value stated inside the same clause as a carve-out', () => {
    // The clause reconciles the two numbers itself; there is nothing contradictory
    // about a shorter notice period during the first year.
    const document = contract(
      '7. NOTICE',
      'The notice period shall be thirty (30) days, or ninety (90) days if notice is given during the first year of the Term.',
    );

    expect(findConflictingQuantities(document)).toEqual([]);
  });

  it('ignores a quantity that names no concept from the vocabulary', () => {
    const document = contract(
      '3. DELIVERY',
      'The goods shall be delivered within seven (7) days of the order.',
      '',
      '9. INSPECTION',
      'The goods shall be inspected within fourteen (14) days of delivery.',
    );

    expect(findConflictingQuantities(document)).toEqual([]);
  });

  it('reports nothing when the document has no clause numbering to attribute a conflict to', () => {
    const document = contract(
      'Either party may terminate this Agreement by giving thirty (30) days notice in writing.',
      '',
      'The Employee shall serve notice of sixty (60) days before leaving the Company.',
    );

    expect(findConflictingQuantities(document)).toEqual([]);
  });

  it('reports a third differing value once, against the first value stated', () => {
    const document = contract(
      '7. TERMINATION',
      'Either party may terminate on notice of thirty (30) days.',
      '',
      '12. EXIT',
      'The Employee shall give notice of sixty (60) days.',
      '',
      '18. GARDEN LEAVE',
      'The Company may require notice of ninety (90) days to be served on garden leave.',
    );

    const findings = findConflictingQuantities(document);

    expect(findings).toHaveLength(2);
    expect(findings.every((finding) => finding.counterpart?.segmentLabel === '7')).toBe(true);
  });

  it('takes the month length from options so the convention is visible rather than buried', () => {
    const document = contract(
      '7. TERMINATION',
      'Either party may terminate this Agreement on one month notice.',
      '',
      '12. EXIT',
      'The Employee shall give thirty (30) days notice before leaving.',
    );

    const findings = findConflictingQuantities(document, {
      monthDays: 31,
      yearDays: 365,
      conceptWindow: 90,
      maxTermChars: 60,
    });

    expect(findings).toHaveLength(1);
  });
});
