import { describe, expect, it } from 'vitest';
import { getNextPhaseButtonLabel } from '../hud/PhaseButtonLabels';
import {
  getAttackButtonState,
  getBuildButtonState,
  getEndPhaseButtonState,
  getFortifyButtonState,
  getHudPhaseFlags,
  getMoveButtonState,
  getNuclearButtonState,
  getStrategicBombButtonState,
} from '../hud/ActionButtonState';

describe('ActionButtonState', () => {
  it('derives phase flags correctly', () => {
    expect(getHudPhaseFlags('combat_move')).toMatchObject({
      movementPhase: true,
      buildPhase: false,
      combatPhase: false,
      endPhase: false,
    });
    expect(getHudPhaseFlags('collect_income').endPhase).toBe(true);
  });

  it('computes move and attack button states', () => {
    const move = getMoveButtonState({
      movementPhase: true,
      isHumanTurn: true,
      hasAvailableUnits: true,
    });
    expect(move.canMove).toBe(true);
    expect(move.labelHtml).toContain('Move Units');

    const attack = getAttackButtonState({
      movementPhase: true,
      combatPhase: false,
      isHumanTurn: true,
      hasAttackTargets: false,
      pendingMoveCount: 0,
    });
    expect(attack.disabled).toBe(true);
    expect(attack.title).toContain('Select your territory');
  });

  it('computes build/strategic bombing states', () => {
    const buildQuick = getBuildButtonState({
      buildPhase: true,
      isHumanTurn: true,
      canMobilize: false,
      turnStyle: 'quick',
    });
    expect(buildQuick.canBuild).toBe(true);
    expect(buildQuick.title).toContain('Open the build menu anytime');

    const buildClassic = getBuildButtonState({
      buildPhase: true,
      isHumanTurn: true,
      canMobilize: false,
      turnStyle: 'classic',
    });
    expect(buildClassic.canBuild).toBe(true);
    expect(buildClassic.title).toContain('Not enough IPCs');

    const bomb = getStrategicBombButtonState({
      movementPhase: false,
      combatPhase: true,
      isHumanTurn: true,
      hasBombers: true,
    });
    expect(bomb.show).toBe(true);
    expect(bomb.disabled).toBe(false);
  });

  it('computes fortify, nuclear, and end-phase states', () => {
    const fortify = getFortifyButtonState({
      buildPhase: true,
      isHumanTurn: true,
      hasFortSystem: true,
      isOwnedLandSelection: true,
      isUnderFortCap: true,
      canBuildFort: true,
      upgradeCost: 12,
      nextFortLevel: 2,
    });
    expect(fortify.show).toBe(true);
    expect(fortify.disabled).toBe(false);
    expect(fortify.title).toContain('12 IPCs');

    const nuclear = getNuclearButtonState({
      isHumanTurn: true,
      hasTech: true,
      readiness: 60,
      canLaunch: false,
    });
    expect(nuclear.show).toBe(true);
    expect(nuclear.disabled).toBe(true);
    expect(nuclear.labelHtml).toContain('60%');

    const endTurn = getEndPhaseButtonState({
      isEndPhase: true,
      nextLabel: 'End Turn',
      isHumanTurn: true,
      noPendingMoves: true,
      noActiveCombat: true,
      noSelection: true,
    });
    expect(endTurn.labelHtml).toContain('End Turn');

    const quickPlayLabel = getNextPhaseButtonLabel('play', 'quick', true);
    const quickEnd = getEndPhaseButtonState({
      isEndPhase: true,
      nextLabel: quickPlayLabel,
      isHumanTurn: true,
      noPendingMoves: true,
      noActiveCombat: true,
      noSelection: true,
    });
    expect(quickPlayLabel).toBe('End Turn');
    expect(quickEnd.labelHtml).toContain('End Turn');

    const end = getEndPhaseButtonState({
      isEndPhase: false,
      nextLabel: 'Combat',
      isHumanTurn: true,
      noPendingMoves: true,
      noActiveCombat: true,
      noSelection: true,
    });
    expect(end.labelHtml).toContain('Combat');
    expect(end.shouldPulse).toBe(true);
  });
});
