import { describe, expect, it } from 'vitest';
import { AttackEffectManager } from './AttackEffect.ts';

describe('AttackEffectManager chainLightning', () => {
  it('fades out prior segment when the next segment spawns', () => {
    const manager = new AttackEffectManager();
    const groupId = 'actor:skill:0';

    manager.spawn('actor', 'e1', { preset: 'chainLightning' }, { chainGroupId: groupId });
    manager.spawn('e1', 'e2', { preset: 'chainLightning' }, { chainGroupId: groupId });

    manager.tick(0);

    const effects = (
      manager as unknown as {
        effects: { sourceId: string; targetId: string; fadeOutElapsedMs?: number }[];
      }
    ).effects;
    expect(effects).toHaveLength(2);
    expect(effects[0]).toMatchObject({
      sourceId: 'actor',
      targetId: 'e1',
      fadeOutElapsedMs: 0,
    });
    expect(effects[1]).toMatchObject({ sourceId: 'e1', targetId: 'e2' });
  });

  it('keeps segments from different chain groups', () => {
    const manager = new AttackEffectManager();

    manager.spawn('a1', 'e1', { preset: 'chainLightning' }, { chainGroupId: 'a1:skill:0' });
    manager.spawn('a2', 'e2', { preset: 'chainLightning' }, { chainGroupId: 'a2:skill:0' });

    manager.tick(0);

    const effects = (manager as unknown as { effects: unknown[] }).effects;
    expect(effects).toHaveLength(2);
  });

  it('stores showTalisman on chain segment when requested', () => {
    const manager = new AttackEffectManager();
    manager.spawn('actor', 'e1', { preset: 'chainLightning' }, { showTalisman: true });
    const effects = (manager as unknown as { effects: { showTalisman?: boolean }[] })
      .effects;
    expect(effects[0]?.showTalisman).toBe(true);
  });

  it('reaches travel progress 1 after travelDurationMs', () => {
    const manager = new AttackEffectManager();
    manager.spawn(
      'actor',
      'e1',
      { preset: 'chainLightning' },
      { travelDurationMs: 200, segmentDurationMs: 400 },
    );
    manager.tick(200);
    const effects = (
      manager as unknown as { effects: { elapsedMs: number; travelDurationMs: number }[] }
    ).effects;
    expect(effects[0]?.elapsedMs).toBe(200);
    expect(effects[0]?.travelDurationMs).toBe(200);
  });
});
