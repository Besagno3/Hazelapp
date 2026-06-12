import { describe, it, expect, beforeEach } from 'vitest';
import { createActor } from 'xstate';
import { gameFlowMachine } from './gameFlow';
import { useSaveStore } from '../store/saveStore';
import { defaultSave } from '../lib/save';
import type { SaveData } from '../types';

function setSave(patch: Partial<SaveData>) {
  useSaveStore.setState({ save: { ...defaultSave(), ...patch }, status: 'ready', userId: null });
}

function startActor() {
  const actor = createActor(gameFlowMachine).start();
  return actor;
}

beforeEach(() => {
  setSave({});
});

describe('gameFlowMachine', () => {
  it('boots to topicSelect for a fresh save', () => {
    const actor = startActor();
    expect(actor.getSnapshot().value).toBe('boot');
    actor.send({ type: 'READY' });
    expect(actor.getSnapshot().value).toBe('topicSelect');
  });

  it('boots straight into the world when unlocked with an avatar', () => {
    setSave({ worldUnlocked: true, avatarId: 'a1' });
    const actor = startActor();
    actor.send({ type: 'READY' });
    expect(actor.getSnapshot().matches('world')).toBe(true);
  });

  it('picking a topic enters the quiz with the topic in context', () => {
    const actor = startActor();
    actor.send({ type: 'READY' });
    actor.send({ type: 'PICK_TOPIC', topic: 'science' });
    expect(actor.getSnapshot().value).toBe('quiz');
    expect(actor.getSnapshot().context.topic).toBe('science');
    actor.send({ type: 'EXIT_QUIZ' });
    expect(actor.getSnapshot().value).toBe('topicSelect');
  });

  it('ENTER_WORLD is ignored while the world is locked', () => {
    const actor = startActor();
    actor.send({ type: 'READY' });
    actor.send({ type: 'ENTER_WORLD' });
    expect(actor.getSnapshot().value).toBe('topicSelect');
  });

  it('ENTER_WORLD routes through avatar selection when no avatar is chosen', () => {
    setSave({ worldUnlocked: true });
    const actor = startActor();
    actor.send({ type: 'READY' });
    actor.send({ type: 'ENTER_WORLD' });
    expect(actor.getSnapshot().value).toBe('avatarSelect');
    // CHOOSE_AVATAR is guarded on the save actually holding an avatar.
    actor.send({ type: 'CHOOSE_AVATAR' });
    expect(actor.getSnapshot().value).toBe('avatarSelect');
    setSave({ worldUnlocked: true, avatarId: 'a1' });
    actor.send({ type: 'CHOOSE_AVATAR' });
    expect(actor.getSnapshot().matches('world')).toBe(true);
  });

  it('world overlays open and close around exploring', () => {
    setSave({ worldUnlocked: true, avatarId: 'a1' });
    const actor = startActor();
    actor.send({ type: 'READY' });
    expect(actor.getSnapshot().matches({ world: 'exploring' })).toBe(true);

    actor.send({ type: 'TALK', npcId: 'elder-lumen' });
    expect(actor.getSnapshot().matches({ world: 'dialogue' })).toBe(true);
    expect(actor.getSnapshot().context.npcId).toBe('elder-lumen');

    actor.send({ type: 'OPEN_SERVICE', service: 'shop', npcId: 'hub-merchant' });
    expect(actor.getSnapshot().matches({ world: 'service' })).toBe(true);
    expect(actor.getSnapshot().context.service).toBe('shop');

    actor.send({ type: 'CLOSE' });
    expect(actor.getSnapshot().matches({ world: 'exploring' })).toBe(true);

    actor.send({
      type: 'OPEN_PATH',
      target: { kind: 'gate', id: 'numbria:gate:11,6', topic: 'math', zoneId: 'numbria' },
    });
    expect(actor.getSnapshot().matches({ world: 'path' })).toBe(true);
    actor.send({ type: 'CLOSE' });

    actor.send({ type: 'OPEN_MENU' });
    expect(actor.getSnapshot().matches({ world: 'menu' })).toBe(true);
    actor.send({ type: 'CLOSE' });
    expect(actor.getSnapshot().matches({ world: 'exploring' })).toBe(true);
  });

  it('encounters enter battle and BATTLE_END returns to the world', () => {
    setSave({ worldUnlocked: true, avatarId: 'a1' });
    const actor = startActor();
    actor.send({ type: 'READY' });
    actor.send({ type: 'ENCOUNTER' });
    expect(actor.getSnapshot().value).toBe('battle');
    actor.send({ type: 'BATTLE_END', result: 'win' });
    expect(actor.getSnapshot().matches({ world: 'exploring' })).toBe(true);
  });

  it('EXIT_TO_TOPICS leaves the world for the training grounds', () => {
    setSave({ worldUnlocked: true, avatarId: 'a1' });
    const actor = startActor();
    actor.send({ type: 'READY' });
    actor.send({ type: 'EXIT_TO_TOPICS' });
    expect(actor.getSnapshot().value).toBe('topicSelect');
  });

  it('RESET returns to boot from anywhere', () => {
    setSave({ worldUnlocked: true, avatarId: 'a1' });
    const actor = startActor();
    actor.send({ type: 'READY' });
    actor.send({ type: 'ENCOUNTER' });
    actor.send({ type: 'RESET' });
    expect(actor.getSnapshot().value).toBe('boot');
  });
});
