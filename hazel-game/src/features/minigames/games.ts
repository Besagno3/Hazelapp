import type { ComponentType } from 'react';
import type { MiniGameId } from '../../content/minigames';
import { retryableLazy, type RetryableLazy } from '../../lib/lazyRetry';
import { PotionLabLogo, StepGuess, StepPh, StepPour, StepStir } from './potionLab/art';
import { BakeryLogo, StepClose, StepCut, StepFill } from './bakery/art';
import { GearsLogo, StepCrank, StepJoin, StepPeg, StepRatio } from './gears/art';
import { MuralLogo, StepImage, StepMirror, StepMix, StepMove, StepPaint } from './mural/art';
import { EchoLogo, StepInterval, StepListen, StepPlay, StepShape } from './echo/art';
import { StarsLogo, StepConnect, StepCoords, StepFact, StepFind } from './stars/art';
import { RingsLogo, StepCount, StepMatch, StepRead } from './rings/art';
import { StepCheck, StepPlace, StepWash, TimelineLogo } from './timeline/art';
import { AirMailLogo, StepDeliver, StepParcel, StepSteer } from './airmail/art';
import { ForgeLogo, StepHammer, StepMeaning, StepPick } from './forge/art';
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
  /** The title card's pictures on Expert, where a game's own differ (§8.3: the Potion Lab's guess has no colours). */
  expertSteps?: readonly [ComponentType, ComponentType, ComponentType];
}

export const GAME_SCREENS: Record<MiniGameId, GameScreens> = {
  'potion-lab': {
    Play: retryableLazy(() => import('./potionLab/PotionLab')),
    Logo: PotionLabLogo,
    steps: [StepPour, StepGuess, StepStir],
    expertSteps: [StepPour, StepPh, StepStir],
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
    // Expert's second step is picking the crank's gear from the ratio, not joining them (UX review round 1).
    expertSteps: [StepPeg, StepRatio, StepCrank],
  },
  'mirror-mural': {
    Play: retryableLazy(() => import('./mural/MirrorMural')),
    Logo: MuralLogo,
    steps: [StepMix, StepPaint, StepMirror],
    expertSteps: [StepMove, StepImage, StepMirror],
  },
  'echos-call': {
    Play: retryableLazy(() => import('./echo/EchosCall')),
    Logo: EchoLogo,
    steps: [StepListen, StepShape, StepPlay],
    expertSteps: [StepListen, StepInterval, StepPlay],
  },
  'star-charts': {
    Play: retryableLazy(() => import('./stars/StarCharts')),
    Logo: StarsLogo,
    steps: [StepFind, StepConnect, StepFact],
    expertSteps: [StepCoords, StepConnect, StepFact],
  },
  'ringwoods-rings': {
    Play: retryableLazy(() => import('./rings/RingwoodsRings')),
    Logo: RingsLogo,
    steps: [StepCount, StepRead, StepMatch],
  },
  'index-timeline': {
    Play: retryableLazy(() => import('./timeline/IndexTimeline')),
    Logo: TimelineLogo,
    steps: [StepWash, StepPlace, StepCheck],
  },
  'ember-air-mail': {
    Play: retryableLazy(() => import('./airmail/EmberAirMail')),
    Logo: AirMailLogo,
    steps: [StepParcel, StepSteer, StepDeliver],
  },
  'word-forge': {
    Play: retryableLazy(() => import('./forge/WordForge')),
    Logo: ForgeLogo,
    steps: [StepMeaning, StepPick, StepHammer],
  },
};
