import { assign, createActor, setup, type SnapshotFrom } from 'xstate';
import { useSelector } from '@xstate/react';
import { useSaveStore } from '../store/saveStore';
import type { PathTarget, ServiceType, Topic } from '../types';

/**
 * The game-flow state machine (#37, resolves #11). One machine owns *where
 * the player is*; Zustand stores own *what the player has* (save, profile,
 * battle session). Guards read the save store at transition time, so guarded
 * transitions (world unlock, avatar chosen) live here instead of leaking
 * into render logic.
 *
 * boot waits for a READY from App once auth + save have loaded; RESET (from
 * sign-out) returns there from anywhere.
 */

export interface FlowContext {
  /** Topic chosen at the training grounds (quiz). */
  topic: Topic | null;
  /** NPC the player is talking to (dialogue/service overlays). */
  npcId: string | null;
  service: ServiceType | null;
  pathTarget: PathTarget | null;
}

export type FlowEvent =
  | { type: 'READY' }
  | { type: 'RESET' }
  | { type: 'PICK_TOPIC'; topic: Topic }
  | { type: 'EXIT_QUIZ' }
  | { type: 'ENTER_WORLD' }
  | { type: 'CHOOSE_AVATAR' }
  | { type: 'TALK'; npcId: string }
  | { type: 'OPEN_SERVICE'; service: ServiceType; npcId: string }
  | { type: 'OPEN_PATH'; target: PathTarget }
  | { type: 'OPEN_MENU' }
  | { type: 'CLOSE' }
  | { type: 'ENCOUNTER' }
  | { type: 'BATTLE_END'; result: 'win' | 'lose' }
  | { type: 'EXIT_TO_TOPICS' };

export const gameFlowMachine = setup({
  types: {
    context: {} as FlowContext,
    events: {} as FlowEvent,
  },
  guards: {
    worldUnlocked: () => useSaveStore.getState().save?.worldUnlocked === true,
    hasAvatar: () => !!useSaveStore.getState().save?.avatarId,
    canResumeWorld: () => {
      const save = useSaveStore.getState().save;
      return save?.worldUnlocked === true && !!save.avatarId;
    },
  },
  actions: {
    // RESET (sign-out) must not leak one player's context into the next.
    clearContext: assign({
      topic: null,
      npcId: null,
      service: null,
      pathTarget: null,
    }),
    assignTopic: assign({
      topic: ({ event }) => (event.type === 'PICK_TOPIC' ? event.topic : null),
    }),
    assignNpc: assign({
      npcId: ({ event }) => (event.type === 'TALK' ? event.npcId : null),
    }),
    assignService: assign({
      service: ({ event }) => (event.type === 'OPEN_SERVICE' ? event.service : null),
      npcId: ({ event, context }) =>
        event.type === 'OPEN_SERVICE' ? event.npcId : context.npcId,
    }),
    assignPath: assign({
      pathTarget: ({ event }) => (event.type === 'OPEN_PATH' ? event.target : null),
    }),
  },
}).createMachine({
  id: 'game',
  initial: 'boot',
  context: { topic: null, npcId: null, service: null, pathTarget: null },
  on: {
    RESET: { target: '.boot', actions: 'clearContext' },
  },
  states: {
    boot: {
      on: {
        READY: [{ guard: 'canResumeWorld', target: 'world' }, { target: 'topicSelect' }],
      },
    },
    topicSelect: {
      on: {
        PICK_TOPIC: { target: 'quiz', actions: 'assignTopic' },
        ENTER_WORLD: [
          { guard: 'canResumeWorld', target: 'world' },
          { guard: 'worldUnlocked', target: 'avatarSelect' },
        ],
      },
    },
    quiz: {
      on: {
        EXIT_QUIZ: 'topicSelect',
        ENTER_WORLD: [
          { guard: 'canResumeWorld', target: 'world' },
          { guard: 'worldUnlocked', target: 'avatarSelect' },
        ],
      },
    },
    avatarSelect: {
      on: {
        CHOOSE_AVATAR: { guard: 'hasAvatar', target: 'world' },
      },
    },
    world: {
      initial: 'exploring',
      on: {
        EXIT_TO_TOPICS: 'topicSelect',
      },
      states: {
        exploring: {
          on: {
            TALK: { target: 'dialogue', actions: 'assignNpc' },
            OPEN_SERVICE: { target: 'service', actions: 'assignService' },
            OPEN_PATH: { target: 'path', actions: 'assignPath' },
            OPEN_MENU: 'menu',
            ENCOUNTER: '#game.battle',
          },
        },
        dialogue: {
          on: {
            CLOSE: 'exploring',
            // Service NPCs offer their service from inside the dialogue.
            OPEN_SERVICE: { target: 'service', actions: 'assignService' },
          },
        },
        service: { on: { CLOSE: 'exploring' } },
        path: { on: { CLOSE: 'exploring' } },
        menu: { on: { CLOSE: 'exploring' } },
      },
    },
    battle: {
      on: {
        BATTLE_END: 'world',
      },
    },
  },
});

export type FlowSnapshot = SnapshotFrom<typeof gameFlowMachine>;

/** The app-wide singleton actor. Tests create their own actors instead. */
export const flowActor = createActor(gameFlowMachine).start();

export function sendFlow(event: FlowEvent): void {
  flowActor.send(event);
}

export function useFlow<T>(selector: (snapshot: FlowSnapshot) => T): T {
  return useSelector(flowActor, selector);
}
