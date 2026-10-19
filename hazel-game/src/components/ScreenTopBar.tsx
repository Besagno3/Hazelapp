import LevelBadge from './LevelBadge';
import StreakBadge from './StreakBadge';
import SwitchPlayerButton from '../features/auth/SwitchPlayerButton';

/**
 * The Training Grounds', quiz's and hero pick's top bar (#110h): the level,
 * the streak and Switch in a row at the top of the page, like the world's
 * (#102i). Floating, the badges covered the "Training Grounds" heading and
 * the rounds-passed line on a phone, and stayed over the topics as the page
 * scrolled. In the page, it scrolls away with it and covers nothing.
 */
export default function ScreenTopBar() {
  return (
    <div data-testid="screen-topbar" className="w-full flex items-start justify-between gap-2 mb-2">
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        <LevelBadge placement="inline" />
        <StreakBadge inline />
      </div>
      <SwitchPlayerButton inline />
    </div>
  );
}
