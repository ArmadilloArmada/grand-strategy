import { describe, expect, it } from 'vitest';
import { usesImplicitAmphibious } from '../unitMovementRules';
import { makeUnit } from './testHelpers';

describe('unitMovementRules', () => {
  it('allows infantry, mech infantry, and marines to self-embark', () => {
    expect(usesImplicitAmphibious(makeUnit({ id: 'infantry', domain: 'land' }))).toBe(true);
    expect(usesImplicitAmphibious(makeUnit({ id: 'mech_infantry', domain: 'land' }))).toBe(true);
    expect(usesImplicitAmphibious(makeUnit({ id: 'marines', domain: 'land' }))).toBe(true);
  });

  it('does not let tanks or artillery swim across seas', () => {
    expect(usesImplicitAmphibious(makeUnit({ id: 'tank', domain: 'land', requiredTransport: true }))).toBe(false);
    expect(usesImplicitAmphibious(makeUnit({ id: 'artillery', domain: 'land', requiredTransport: true }))).toBe(false);
  });
});
