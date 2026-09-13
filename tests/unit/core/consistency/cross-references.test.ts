import { describe, expect, it } from 'vitest';

import { findDanglingCrossReferences } from '@/core/consistency/cross-references';

import { contract, quotes } from './helpers';

describe('findDanglingCrossReferences', () => {
  it('flags a reference to clause 14.2 when the document has no clause 14.2', () => {
    const document = contract(
      '1. DEFINITIONS',
      'In this Agreement the following expressions apply.',
      '',
      '7. TERMINATION',
      'Either party may terminate this Agreement as provided in Clause 14.2.',
    );

    const findings = findDanglingCrossReferences(document);

    expect(findings).toHaveLength(1);
    expect(quotes(findings)).toEqual(['14.2']);
    expect(findings[0]?.at.segmentLabel).toBe('7');
    expect(findings[0]?.severity).toBe('high');
  });

  it('accepts a reference to an existing clause', () => {
    const document = contract(
      '7. NOTICES',
      'Notices shall be served by hand.',
      '',
      '8. TERMINATION',
      'Termination notices shall be served in the manner set out in clause 7.',
    );

    expect(findDanglingCrossReferences(document)).toEqual([]);
  });

  it('accepts a reference to clause 7 when the document numbers only 7.1 and 7.2', () => {
    // The parent heading is often unnumbered prose ("TERMINATION"), so demanding an
    // exact "7" would flag a document that reads perfectly well.
    const document = contract(
      '7.1 The Employee shall serve notice.',
      '',
      '7.2 The Employer may waive notice.',
      '',
      '8. The provisions of clause 7 shall survive termination.',
    );

    expect(findDanglingCrossReferences(document)).toEqual([]);
  });

  it('flags a reference to clause 7.1 when the document has only a clause 7', () => {
    // The converse of the rule above: a parent says nothing about whether a
    // sub-clause was ever drafted, and this is the defect the detector exists for.
    const document = contract(
      '7. TERMINATION',
      'The Employer may terminate summarily.',
      '',
      '8. SURVIVAL',
      'The obligations in clause 7.1 survive termination.',
    );

    expect(quotes(findDanglingCrossReferences(document))).toEqual(['7.1']);
  });

  it('does not mistake a clause heading for a reference to itself', () => {
    const document = contract('Clause 7. TERMINATION', 'The Employer may terminate summarily.');

    expect(findDanglingCrossReferences(document)).toEqual([]);
  });

  it('does not flag a citation of a statutory section', () => {
    const document = contract(
      '1. PAYMENT',
      'The Buyer shall pay on presentation.',
      '',
      '2. DISHONOUR',
      'A dishonoured cheque attracts liability under Section 138 of the Negotiable Instruments Act, 1881.',
    );

    expect(findDanglingCrossReferences(document)).toEqual([]);
  });

  it('checks every clause named in a list of references', () => {
    const document = contract(
      '7. RENT',
      'Rent is payable monthly.',
      '',
      '8. DEPOSIT',
      'The deposit is refundable.',
      '',
      '9. SURVIVAL',
      'The obligations in clauses 7, 8 and 19 survive termination.',
    );

    expect(quotes(findDanglingCrossReferences(document))).toEqual(['19']);
  });

  it('stays silent on a schedule reference when the document declares no schedules', () => {
    // Schedules are frequently stapled on as a separate file, and a text layer that
    // never contained them must not be reported as having lost them.
    const document = contract(
      '1. CHARGES',
      'The charges payable are set out in Schedule B.',
      '',
      '2. PAYMENT',
      'Charges are payable monthly.',
    );

    expect(findDanglingCrossReferences(document)).toEqual([]);
  });

  it('flags a reference to Schedule C when the document declares only Schedules A and B', () => {
    const document = contract(
      '1. CHARGES',
      'The charges payable are set out in Schedule C.',
      '',
      'SCHEDULE A',
      'Recurring charges.',
      '',
      'SCHEDULE B',
      'One-time charges.',
    );

    const findings = findDanglingCrossReferences(document);

    expect(quotes(findings)).toEqual(['C']);
    expect(findings[0]?.detail).toContain('schedule');
  });

  it('reports nothing at all when the document has no numbered clauses', () => {
    // Every reference would dangle, which would be a finding about the extraction
    // rather than about the contract.
    const document = contract(
      'The Tenant shall vacate the premises as provided in clause 14.2 of this Agreement,',
      'and shall pay all outstanding dues as provided in clause 3.',
    );

    expect(findDanglingCrossReferences(document)).toEqual([]);
  });

  it('carries a span that highlights the reference in the canonical text', () => {
    const document = contract(
      '1. SCOPE',
      'The services are those described in clause 22.',
    );

    const finding = findDanglingCrossReferences(document)[0];

    expect(finding).toBeDefined();
    if (finding === undefined) return;
    expect(document.text.slice(finding.at.start, finding.at.end)).toBe('22');
  });
});
