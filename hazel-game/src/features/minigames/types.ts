import type { ReactNode } from 'react';
import type { MiniGameDef, PlayBand } from '../../content/minigames';

/**
 * What the stage hands a game (docs/DESIGN-MINIGAMES.md §4). A game draws its
 * scene and controls; the stage saves what it finds and pays for it, and
 * shows the reward when a round is done.
 */
export interface PlayProps {
  def: MiniGameDef;
  /** Expert only where the game has it (`def.expert`); a game without one plays Tricky (`upToTricky`). */
  band: PlayBand;
  /** How many rounds the kid has finished this visit (a game's orders go round in turn). */
  round: number;
  /**
   * A page of the collection found: saved at once, and paid the first time.
   * True when it's new. `label` is how the reward names it ("Lemon juice").
   */
  onPage: (page: string, label: string) => boolean;
  /** The round is finished: the stage pays it (unless `onClaim` has) and shows the reward. */
  onFinish: (outcome: RoundOutcome) => void;
  /**
   * The round's pay is earned, though something just for fun comes before the
   * reward (Mirror Mural's own canvas): paid now, once, so leaving by 🗺️ Map
   * keeps it — and the Expert seal, if `spotOn` wins it; `onFinish` then shows
   * them on the reward.
   */
  onClaim?: (spotOn?: RoundOutcome['spotOn']) => void;
}

/** What a finished round says on the reward screen. */
export interface RoundOutcome {
  /** "Berry Potion brewed!" */
  title: string;
  /** One sentence: what the kid found out. */
  learned: string;
  /** A colour to show beside it (the potion's). */
  swatch?: string;
  /** Or a picture (the one the kid hung in Mirror Mural's Gallery). Decorative: the title says what it is. */
  picture?: ReactNode;
  /**
   * On Expert (§8.3): how many of the round's answers were spot on — right
   * first time — of how many. All of them is the Expert seal.
   */
  spotOn?: { right: number; of: number };
}
