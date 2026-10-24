import LevelBadge from './LevelBadge';
import StreakBadge from './StreakBadge';
import SwitchPlayerButton from '../features/auth/SwitchPlayerButton';

/**
 * The Training Grounds', quiz's and hero pick's top bar (#110h): the level,
 * the streak and Switch player in a row at the top of the page, like the
 * world's (#102i). Floating, the badges covered the "Training Grounds" heading
 * and the rounds-passed line on a phone, and stayed over the topics as the
 * page scrolled. In the page, it scrolls away with it and covers nothing. The
 * quiz keeps it while a question is on its way (#163). "Switch player" in
 * full where it fits (from 400 px; "Switch" alone could mean the hero or the
 * topic), and a short landscape phone keeps the gap under it small. Two
 * players on one screen (#191): `badges` false leaves out the level and
 * streak (the kid playing's, beside Player 2's own XP), and `switchable`
 * false leaves out Switch player while a duel is in play — "Switch" read as
 * handing over the turn, and threw the duel away.
 */
export default function ScreenTopBar({ badges = true, switchable = true }: { badges?: boolean; switchable?: boolean } = {}) {
  return (
    <div data-testid="screen-topbar" className="w-full flex items-start justify-between gap-2 mb-2 [@media(max-height:500px)]:mb-1">
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        {badges && (
          <>
            <LevelBadge placement="inline" />
            <StreakBadge inline />
          </>
        )}
      </div>
      {switchable && <SwitchPlayerButton inline fullName />}
    </div>
  );
}
