import type { ComponentType } from 'react';
import type { MiniGameId } from '../../content/minigames';
import { retryableLazy, type RetryableLazy } from '../../lib/lazyRetry';
import { PotionLabLogo, StepGuess, StepPour, StepStir } from './potionLab/art';
import { BakeryLogo, StepClose, StepCut, StepFill } from './bakery/art';
import { GearsLogo, StepCrank, StepJoin, StepPeg } from './gears/art';
import type { PlayProps } from './types';

/**
 * Each mini-game's screen and its title-card pictures (docs/DESIGN-MINIGAMES.md
 * §4). The pictures load with the stage; a game's play screen loads the first
 * time it's played (its own file, so ten games don't weigh on the world).
 */
export interface GameScreens {
  Play: RetryableLazy<PlayProps>;
  Logo: ComponentType<{ size?: number }>;
  steps: readonly [ComponentType, ComponentType, ComponentType];
}

export const GAME_SCREENS: Record<MiniGameId, GameScreens> = {
  'potion-lab': {
    Play: retryableLazy(() => import('./potionLab/PotionLab')),
    Logo: PotionLabLogo,
    steps: [StepPour, StepGuess, StepStir],
  },
  'dots-bakery': {
    Play: retryableLazy(() => import('./bakery/DotsBakery')),
    Logo: BakeryLogo,
    steps: [StepCut, StepFill, StepClose],
  },
  'clocktower-gears': {
    Play: retryableLazy(() => import('./gears/ClocktowerGears')),
    Logo: GearsLogo,
    steps: [StepPeg, StepJoin, StepCrank],
  },
};
