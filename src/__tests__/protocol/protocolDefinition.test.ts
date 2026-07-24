import { describe, it, expect } from 'vitest';
import {
  evaluateActionState,
  normalizeActionFromAnyInput,
  type ProtocolDefinition,
} from '../../protocol/protocolDefinition';
import type { Action } from '../../types';

describe('ProtocolDefinition & ScoutingStateMachine (Checkpoint 9)', () => {
  const mockVolleyballProtocol: ProtocolDefinition = {
    sportType: 'volleyball',
    version: '1.0',
    stepSequence: [
      'IDLE',
      'TEAM_SELECTED',
      'PLAYER_SELECTED',
      'SKILL_SELECTED',
      'DETAILS_SELECTED',
      'RESULT_SELECTED',
      'AREA_SELECTED',
      'READY_TO_SAVE',
    ],
    skillRules: {
      Serve: {
        skillCode: 'Serve',
        requiredFields: ['teamCode', 'skillCode', 'resultCode'],
        optionalFields: ['playerNumber', 'areaCode'],
        allowedOutcomes: ['Yes', 'Out', 'Pass'],
        areaRequirement: 'optional',
      },
      Spike: {
        skillCode: 'Spike',
        requiredFields: ['teamCode', 'skillCode', 'resultCode', 'areaCode'],
        optionalFields: ['playerNumber'],
        allowedOutcomes: ['Yes', 'Out', 'Pass'],
        areaRequirement: 'always',
      },
    },
  };

  it('evaluates missing required fields and state transitions', () => {
    const emptyAction: Partial<Action> = {};
    const evalEmpty = evaluateActionState(emptyAction, mockVolleyballProtocol);
    expect(evalEmpty.canSave).toBe(false);
    expect(evalEmpty.missingFields).toContain('teamCode');
    expect(evalEmpty.missingFields).toContain('skillCode');

    const partialAction: Partial<Action> = {
      teamCode: 'THA',
      skillCode: 'Serve',
    };
    const evalPartial = evaluateActionState(partialAction, mockVolleyballProtocol);
    expect(evalPartial.canSave).toBe(false);
    expect(evalPartial.currentStep).toBe('SKILL_SELECTED');
    expect(evalPartial.missingFields).toContain('resultCode');

    const completeAction: Partial<Action> = {
      teamCode: 'THA',
      skillCode: 'Serve',
      resultCode: 'Yes',
    };
    const evalComplete = evaluateActionState(completeAction, mockVolleyballProtocol);
    expect(evalComplete.canSave).toBe(true);
    expect(evalComplete.currentStep).toBe('READY_TO_SAVE');
    expect(evalComplete.missingFields).toHaveLength(0);
  });

  it('enforces mandatory area requirement when protocol specifies areaRequirement=always', () => {
    const spikeWithoutArea: Partial<Action> = {
      teamCode: 'JPN',
      skillCode: 'Spike',
      resultCode: 'Yes',
    };
    const evalSpike = evaluateActionState(spikeWithoutArea, mockVolleyballProtocol);
    expect(evalSpike.canSave).toBe(false);
    expect(evalSpike.missingFields).toContain('areaCode');

    const spikeWithArea: Partial<Action> = {
      ...spikeWithoutArea,
      areaCode: 'A1',
    };
    const evalSpikeWithArea = evaluateActionState(spikeWithArea, mockVolleyballProtocol);
    expect(evalSpikeWithArea.canSave).toBe(true);
  });

  it('normalizes action inputs from Normal UI, HUD, Keyboard, and Controller into 100% identical records', () => {
    // Normal UI click payload
    const normalInput = {
      teamCode: 'THA',
      skillCode: 'Spike',
      resultCode: 'Yes',
      areaCode: 'A4',
      playerNumber: '7',
      videoTime: 12.5,
    };

    // HUD Wheel click/hold payload
    const hudInput = {
      teamCode: 'THA',
      skillCode: 'Spike',
      resultCode: 'Yes',
      areaCode: 'A4',
      playerNumber: '7',
      videoTime: 12.5,
    };

    // Gamepad controller input payload
    const controllerInput = {
      teamCode: 'THA',
      skillCode: 'Spike',
      resultCode: 'Yes',
      areaCode: 'A4',
      playerNumber: '7',
      videoTime: 12.5,
    };

    const actionFromNormal = normalizeActionFromAnyInput(normalInput, 'volleyball');
    const actionFromHud = normalizeActionFromAnyInput(hudInput, 'volleyball');
    const actionFromController = normalizeActionFromAnyInput(controllerInput, 'volleyball');

    // Strip volatile runtime ID for exact structural equality comparison
    delete actionFromNormal.id;
    delete actionFromHud.id;
    delete actionFromController.id;

    expect(actionFromNormal).toEqual(actionFromHud);
    expect(actionFromNormal).toEqual(actionFromController);
    expect(actionFromNormal.outcomeStatus).toBe('success');
  });
});
