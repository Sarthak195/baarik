import { describe, expect, it } from 'vitest';

import { findTermInconsistencies } from '@/core/consistency/defined-terms';
import type { Inconsistency, InconsistencyKind } from '@/core/consistency/types';

import { contract } from './helpers';

function ofKind(findings: readonly Inconsistency[], kind: InconsistencyKind): readonly string[] {
  return findings.filter((finding) => finding.kind === kind).map((finding) => finding.title);
}

describe('findTermInconsistencies', () => {
  it('flags a quoted capitalised term that no clause defines', () => {
    const document = contract(
      '1. RENT',
      'The Tenant shall pay the "Maintenance Charge" monthly in advance.',
    );

    const findings = findTermInconsistencies(document);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('undefined_term');
    expect(findings[0]?.title).toContain('Maintenance Charge');
    expect(findings[0]?.at.segmentLabel).toBe('1');
  });

  it('accepts a term defined with "means" and used later', () => {
    const document = contract(
      '1. DEFINITIONS',
      '"Lock-in Period" means the first eleven months of the Term.',
      '',
      '2. OCCUPATION',
      'The Tenant shall not vacate the premises during the Lock-in Period.',
    );

    expect(findTermInconsistencies(document)).toEqual([]);
  });

  it('accepts a term defined with curly quotes and "shall mean"', () => {
    const document = contract(
      '1. DEFINITIONS',
      '“Service Period” shall mean the period of twenty-four months from the Effective Date.',
      '',
      '2. BOND',
      'The Employee shall remain in service for the Service Period.',
    );

    expect(findTermInconsistencies(document)).toEqual([]);
  });

  it('accepts a term baptised in a parenthetical rather than a definitions clause', () => {
    // "(the "Deposit")" binds exactly as tightly as a definitions clause and is far
    // more common in the body of an Indian contract.
    const document = contract(
      '1. DEPOSIT',
      'The Tenant shall pay a sum of Rs. 50,000 (the "Deposit") on execution.',
      '',
      '2. REFUND',
      'The Deposit shall be refunded within thirty days of vacating.',
    );

    expect(findTermInconsistencies(document)).toEqual([]);
  });

  it('accepts a term introduced as hereinafter referred to as', () => {
    const document = contract(
      '1. PARTIES',
      'ACME Private Limited, hereinafter referred to as the "Company", of the first part.',
      '',
      '2. DUTIES',
      'The Company shall provide the equipment necessary for the work.',
    );

    expect(findTermInconsistencies(document)).toEqual([]);
  });

  it('flags a term that is defined and then never used again', () => {
    // The classic template remnant: the clause that relied on the term was deleted
    // and the definition was left behind.
    const document = contract(
      '1. DEFINITIONS',
      '"Force Majeure Event" means any event beyond the reasonable control of a party.',
      '',
      '2. RENT',
      'The Tenant shall pay rent monthly in advance.',
    );

    const findings = findTermInconsistencies(document);

    expect(ofKind(findings, 'unused_definition')).toHaveLength(1);
    expect(findings[0]?.title).toContain('Force Majeure Event');
    expect(findings[0]?.severity).toBe('low');
  });

  it('does not call a term undefined merely because it appears only in the definitions clause', () => {
    const document = contract(
      '1. DEFINITIONS',
      '"Force Majeure Event" means any event beyond the reasonable control of a party.',
    );

    expect(ofKind(findTermInconsistencies(document), 'undefined_term')).toEqual([]);
  });

  it('counts a term used inside the definition of another term as used', () => {
    const document = contract(
      '1. DEFINITIONS',
      '"Rent" means the monthly sum payable under clause 3.',
      '"Arrears" means any Rent that remains unpaid for fifteen days.',
      '',
      '2. ARREARS',
      'Interest is payable on Arrears at eighteen percent per annum.',
    );

    expect(findTermInconsistencies(document)).toEqual([]);
  });

  it('does not treat an apostrophe as the start of a defined term', () => {
    const document = contract(
      "1. OBLIGATIONS",
      "The Lessee's obligations under this Agreement are personal to the Lessee.",
    );

    expect(findTermInconsistencies(document)).toEqual([]);
  });

  it('ignores a quoted lower-case phrase, which is prose being quoted rather than a defined term', () => {
    const document = contract(
      '1. CONDITION',
      'The premises are let on an "as is where is" basis without warranty.',
    );

    expect(findTermInconsistencies(document)).toEqual([]);
  });

  it('reports a term used in many clauses only once', () => {
    const document = contract(
      '1. CHARGES',
      'The Tenant shall pay the "Maintenance Charge" on the first day of each month.',
      '',
      '2. DEFAULT',
      'Failure to pay the "Maintenance Charge" is a material breach.',
    );

    expect(findTermInconsistencies(document)).toHaveLength(1);
  });

  it('carries a span covering the quoted term including its quotation marks', () => {
    const document = contract('1. RENT', 'The Tenant shall pay the "Maintenance Charge" monthly.');

    const finding = findTermInconsistencies(document)[0];

    expect(finding).toBeDefined();
    if (finding === undefined) return;
    expect(document.text.slice(finding.at.start, finding.at.end)).toBe('"Maintenance Charge"');
  });
});
