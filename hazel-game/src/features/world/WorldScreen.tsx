import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import WorldCanvas, { type Travel } from './WorldCanvas';
import TouchPad from './TouchPad';
import DialogueOverlay from './DialogueOverlay';
import ServiceOverlay from './ServiceOverlay';
import PathQuestionOverlay from './PathQuestionOverlay';
import KeyGateOverlay from './KeyGateOverlay';
import MenuOverlay from './MenuOverlay';
import SpireOverlay from './SpireOverlay';
import StoryPanels from '../../components/StoryPanels';
import { zone, TILE, fogSeenFlag, HUB_ZONE, ZONES, litFlag } from '../../content/zones';
import {
  CALM_SECONDS,
  canGlow,
  knowsFieldSpell,
  returnLanding,
  visitedFlag,
  type FieldCast,
} from '../../content/fieldSpells';
import { SPIRE_FLOORS, SPIRE_LIVES, floorSpawnPx, spireFloorTitle } from '../../content/spire';
import { dungeonFloor, floorLabel } from '../../content/dungeons';
import { useSpireStore } from '../../store/spireStore';
import { atTier, spawnPlaced } from '../../content/enemies';
import { lossKey, mercyFor } from '../../lib/battleTurn';
import { roadTier } from '../../lib/wayfinding';
import { arrivalWarning, zoneTier } from '../../content/regions';
import { avatarById } from '../../content/avatars';
import { TOPIC_REGISTRY, crystalFlag } from '../../content/topics';
import { bossDefeated } from '../../content/keys';
import {
  emberStatus,
  endingPanels,
  EMBER_SPRITES,
  EMBER_SPRITE_IDS,
  EMBER_STAGE_LABEL,
  EMBER_HATCHED,
  EMBER_HATCH_SEEN,
  HATCH_PANELS,
  INTRO_PANELS,
  INTRO_SEEN,
  ENDING_SEEN,
  CRYSTAL_PANELS,
  SPIRE_PANELS,
  SPIRE_AWAKE_SEEN,
  SPIRE_CLEARED,
  SPIRE_VICTORY_SEEN,
  spireVictoryPanels,
  crystalSceneFlag,
  GROVE_PANELS,
  GROVE_SEEN,
  DAWNREACH_PANELS,
  DAWNREACH_SEEN,
  ACT2_PANELS,
  ACT2_SEEN,
  FIRST_VOYAGE_PANELS,
  GREAT_FOGBANK_MET,
  GREAT_FOGBANK_PANELS,
  GREAT_FOGBANK_SEEN,
} from '../../content/story';
import { FIRST_VOYAGE_SEEN, GREAT_FOGBANK, boatSpot, moorBoat } from '../../content/boat';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { claimSecret, rewardSummary, secretById, secretFlag } from '../../content/secrets';
import type { SecretDef } from '../../content/zones';
import { sfx } from '../../lib/audio';
import { playerAge } from '../../lib/age';
import { toastMs } from '../../lib/toast';
import { heroMaxHp } from '../../lib/powerups';
import { prefetchQuestions, BATTLE_QUESTION_COUNT } from '../../lib/questions';
import { useSaveStore } from '../../store/saveStore';
import { useProfileStore } from '../../store/profileStore';
import { useBattleStore } from '../../store/battleStore';
import { sendFlow, useFlow } from '../../machines/gameFlow';

/**
 * The world of Lumina (#37): KaPlay canvas + JRPG HUD + DOM overlays
 * (dialogue / services / path questions / menu), driven by the game-flow
 * machine's `world.*` substates. The canvas pauses (not unmounts) under
 * overlays and remounts per zone.
 */
export default function WorldScreen() {
  const save = useSaveStore((s) => s.save);
  const update = useSaveStore((s) => s.update);
  const setFlag = useSaveStore((s) => s.setFlag);
  const flush = useSaveStore((s) => s.flush);
  const profile = useProfileStore((s) => s.profile);
  const defeatedIds = useBattleStore((s) => s.defeatedIds);
  const startBattle = useBattleStore((s) => s.start);

  const overlay = useFlow((s) =>
    s.matches({ world: 'dialogue' })
      ? 'dialogue'
      : s.matches({ world: 'service' })
        ? 'service'
        : s.matches({ world: 'path' })
          ? 'path'
          : s.matches({ world: 'menu' })
            ? 'menu'
            : s.matches({ world: 'spire' })
              ? 'spire'
              : null,
  );
  const npcId = useFlow((s) => s.context.npcId);
  const service = useFlow((s) => s.context.service);
  const pathTarget = useFlow((s) => s.context.pathTarget);

  // Spire climb (#74): while on a floor, the canvas shows that floor's map and
  // the world runs only while the hero is free to explore (no panel open).
  const spireFloorIndex = useSpireStore((s) => s.floor);
  const spireExploring = useSpireStore((s) => s.exploring);
  const spireLives = useSpireStore((s) => s.lives);
  const spireBroken = useSpireStore((s) => s.broken);
  const spireBump = useSpireStore((s) => s.bump);
  const onSpireFloor = overlay === 'spire' && spireFloorIndex !== null;
  const spireTheme = onSpireFloor ? SPIRE_FLOORS[spireFloorIndex].theme : null;
  const touchDirRef = useRef({ dx: 0, dy: 0 });
  const onDirChange = useCallback((dx: number, dy: number) => {
    touchDirRef.current = { dx, dy };
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  // One timer for whichever toast is up: a new toast replaces the old one's
  // timer, so an earlier toast can't hide a newer one early.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  // Field spells (#75 item 9): a Return waiting to fly (the canvas takes it
  // once the menu has closed) and the seconds of Calm left (the canvas counts
  // them down while the world runs; `calmLeft` is the HUD's copy).
  const travelRef = useRef<Travel | null>(null);
  const calmRef = useRef(0);
  const [calmLeft, setCalmLeft] = useState(0);
  // The secret just found — shown in a small celebration card.
  const [found, setFound] = useState<SecretDef | null>(null);
  useEffect(() => {
    if (!found) return;
    const t = setTimeout(() => setFound(null), 4000);
    return () => clearTimeout(t);
  }, [found]);

  const age = playerAge(profile);
  const skillLevels = profile?.skillLevels ?? {};
  const zoneId = save?.zoneId ?? HUB_ZONE;
  const z = zone(zoneId);
  const avatar = avatarById(save?.avatarId ?? null);
  const maxHp = heroMaxHp(avatar, profile?.powerUps ?? {});
  const hp = Math.min(save?.hp ?? maxHp, maxHp);
  const flags = save?.flags ?? {};
  const { crystals, stage: ember } = emberStatus(flags);

  // Story moments (#37 story pass + expansion + #55 Spire finale). Exactly one
  // plays at a time; priority: Spire victory (true finale) → intro → hatch →
  // crystal-restored → Spire awakens → ending (the call to climb the Spire).
  const spireVictoryDue = flags[SPIRE_CLEARED] === true && !flags[SPIRE_VICTORY_SEEN];
  const introDue = !flags[INTRO_SEEN];
  const hatchDue = flags[EMBER_HATCHED] === true && !flags[EMBER_HATCH_SEEN];
  const crystalSceneTopic =
    TOPIC_REGISTRY.find((t) => flags[crystalFlag(t.id)] && !flags[crystalSceneFlag(t.id)])?.id ??
    null;
  const spireAwakeDue = crystals >= 1 && !flags[SPIRE_AWAKE_SEEN];
  const endingDue = crystals === TOPIC_REGISTRY.length && !flags[ENDING_SEEN];
  // Location-triggered: plays once on first stepping into the hidden grove,
  // and once on the first step out onto Dawnreach (#75 Phase 1).
  const groveDue = zoneId === 'moonwell-grove' && !flags[GROVE_SEEN];
  const dawnreachDue = zoneId === 'dawnreach' && !flags[DAWNREACH_SEEN];
  // Act II (#75 item 14): the morning after the Spire's finale; the first
  // time in the boat; the first bump into the Great Fogbank.
  const act2Due = flags[SPIRE_VICTORY_SEEN] === true && !flags[ACT2_SEEN];
  const voyageDue = save?.aboard === true && !flags[FIRST_VOYAGE_SEEN];
  const fogbankDue = flags[GREAT_FOGBANK_MET] === true && !flags[GREAT_FOGBANK_SEEN];

  const activeScene:
    | 'spireVictory'
    | 'intro'
    | 'hatch'
    | 'crystal'
    | 'spire'
    | 'ending'
    | 'grove'
    | 'dawnreach'
    | 'act2'
    | 'voyage'
    | 'fogbank'
    | null = spireVictoryDue
    ? 'spireVictory'
    : introDue
      ? 'intro'
      : hatchDue
        ? 'hatch'
        : crystalSceneTopic
          ? 'crystal'
          : spireAwakeDue
            ? 'spire'
            : endingDue
              ? 'ending'
              : act2Due
                ? 'act2'
                : groveDue
                  ? 'grove'
                  : dawnreachDue
                    ? 'dawnreach'
                    : voyageDue
                      ? 'voyage'
                      : fogbankDue
                        ? 'fogbank'
                        : null;
  const cutscene = activeScene !== null;

  const pausedRef = useRef(false);
  useEffect(() => {
    const spireFree = overlay === 'spire' && spireExploring;
    pausedRef.current = (overlay !== null && !spireFree) || cutscene;
  }, [overlay, cutscene, spireExploring]);

  // Remember every place the hero has been: Return flies to the towns (#75 item 9).
  // Arriving somewhere new that fights far tougher than the 🚩's road (the
  // Coast, early on) says so once, and points back to the road (#75 item 12).
  const visitedHere = save?.flags[visitedFlag(zoneId)] === true;
  useEffect(() => {
    if (!save || visitedHere) return;
    setFlag(visitedFlag(zoneId));
    const warning = arrivalWarning(zoneTier(zoneId), roadTier(save.flags));
    if (warning) showToast(warning);
    // Only on arriving somewhere new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, visitedHere]);

  // Warm each living enemy's battle questions while the player explores.
  useEffect(() => {
    if (!save) return;
    for (const p of z.enemies) {
      const enemy = spawnPlaced(zoneId, p, age, skillLevels);
      if (enemy.isBoss && bossDefeated(enemy.id, enemy.topic, save.flags)) continue;
      if (defeatedIds.includes(enemy.instanceId)) continue;
      prefetchQuestions(enemy.topic, age, enemy.level, BATTLE_QUESTION_COUNT);
    }
    // Re-warm only when the zone changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId]);

  useEffect(() => {
    if (activeScene === 'ending' || activeScene === 'spireVictory')
      confetti({ particleCount: 320, spread: 130, origin: { y: 0.4 } });
    else if (activeScene === 'crystal') confetti({ particleCount: 160, spread: 100, origin: { y: 0.4 } });
  }, [activeScene]);

  if (!save || !avatar) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-700 to-teal-900 p-6">
        <p className="text-white mb-4">Pick an avatar first to enter the world.</p>
        <button
          onClick={() => sendFlow({ type: 'EXIT_TO_TOPICS' })}
          className="bg-white text-emerald-700 font-semibold rounded-lg px-5 py-2"
        >
          Back
        </button>
      </div>
    );
  }

  function showToast(text: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), toastMs(text));
  }

  /** A field spell cast from the menu, or Glow from the HUD (#75 item 9). */
  function castFieldSpell(cast: FieldCast) {
    sfx('spell');
    if (cast.spell === 'return') {
      // Flying off mid-voyage leaves the boat moored where it floats (#75 item 14).
      if (save?.aboard) update((s) => ({ ...s, ...moorBoat(s) }));
      const at = returnLanding(ZONES, cast.to);
      travelRef.current = { to: cast.to, x: at.x, y: at.y };
      showToast(`🏠 Return! Off to ${zone(cast.to).name}…`);
    } else if (cast.spell === 'glow') {
      setFlag(litFlag(zoneId));
      showToast(z.dark?.lit ?? '🔆 Glow!');
    } else {
      calmRef.current = CALM_SECONDS;
      setCalmLeft(CALM_SECONDS);
      showToast(`🕊️ Calm! Critters will let you pass for ${CALM_SECONDS} seconds.`);
    }
  }
  const knowsGlow = knowsFieldSpell('glow', flags);
  // On a dungeon floor (#75 item 10) the title says which floor: "B2 — The Gear Halls",
  // numbered like the Spire's "Floor 2 — …". The label never wraps away from the name.
  const floor = dungeonFloor(zoneId);
  const hudTitle = floor ? (
    <>
      <span className="whitespace-nowrap">{floorLabel(floor.dungeon.goes, floor.index)} —</span> {z.name}
    </>
  ) : (
    z.name
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-br from-slate-900 to-indigo-950 p-4 pt-16">
      {/* Responsive stage: as wide as the viewport allows while keeping the
          11:7 zone fully on screen (cap leaves room for top bar + footer). */}
      <div
        className="flex flex-col items-center"
        style={{ width: 'min(96vw, calc((100dvh - 220px) * 11 / 7))' }}
      >
      {/* HUD */}
      {/* On a phone the stats don't leave a place name room beside them, so the
          row wraps: the name on its own line, the stats right-aligned below. */}
      <div className="w-full flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-white mb-2 px-1">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight">
            {spireTheme ? spireFloorTitle(spireFloorIndex!) : hudTitle}
          </h1>
          <p className="text-[11px] text-white/60">
            💎 {crystals}/{TOPIC_REGISTRY.length} crystals restored
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
          <span title={`Ember — ${EMBER_STAGE_LABEL[ember]}`}>
            <CharacterPortrait spriteId={EMBER_SPRITE_IDS[ember]} emoji={EMBER_SPRITES[ember]} scale={0.75} />
          </span>
          <span title="HP">
            ❤️ {hp}/{maxHp}
          </span>
          <span title="Coins">🪙 {save.coins}</span>
          <span title="Potions">🧪 {save.items.potion}</span>
          {save.aboard && (
            <span title="Sailing Marlow's boat" aria-label="Sailing Marlow's boat" className="rounded-full bg-sky-400/20 px-2 py-0.5">
              ⛵
            </span>
          )}
          {calmLeft > 0 && (
            <span title="Calm: critters let you pass" className="rounded-full bg-sky-400/20 px-2 py-0.5 text-sky-100">
              🕊️ {calmLeft}s
            </span>
          )}
          {/* In a dark place, Glow is one tap away (#75 item 9). */}
          {knowsGlow && canGlow(z, flags) && overlay === null && !cutscene && (
            <button
              onClick={() => castFieldSpell({ spell: 'glow' })}
              aria-label="Cast Glow"
              title="Cast Glow"
              className="bg-amber-400 hover:bg-amber-300 text-amber-950 rounded-lg px-3 py-1.5 text-xs font-bold"
            >
              {/* Just the lamp on a phone, so the place name keeps its room. */}
              🔆<span className="hidden sm:inline"> Glow</span>
            </button>
          )}
          {/* The machine's Spire state ignores OPEN_MENU, so don't offer it
              mid-climb — the Spire HUD has its own "Leave the Spire". */}
          {overlay !== 'spire' && (
            <button
              onClick={() => sendFlow({ type: 'OPEN_MENU' })}
              className="bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              📜 Menu
            </button>
          )}
        </div>
      </div>

      <WorldCanvas
        zoneId={zoneId}
        avatar={avatar}
        age={age}
        skillLevels={skillLevels}
        emberStage={ember}
        startPos={spireTheme ? floorSpawnPx(spireTheme, TILE) : save.pos}
        flags={save.flags}
        openedChests={save.openedChests}
        defeatedIds={defeatedIds}
        pausedRef={pausedRef}
        touchDirRef={touchDirRef}
        callbacks={{
          // Floor positions are never saved — a reload lands back at the Spire door.
          onMove: (x, y) => {
            if (!spireTheme) update((s) => ({ ...s, pos: { x, y } }));
          },
          onTalk: (id) => sendFlow({ type: 'TALK', npcId: id }),
          onPath: (target) => sendFlow({ type: 'OPEN_PATH', target }),
          onSaveCrystal: () => {
            void flush();
            showToast('💎 Game saved!');
          },
          onExit: (to, spawnX, spawnY) =>
            update((s) => ({
              ...s,
              zoneId: to,
              pos: { x: spawnX * TILE + TILE / 2, y: spawnY * TILE + TILE / 2 },
            })),
          onEncounter: (enemy) => {
            // Mercy far from home (#75 item 12): a critter that has beaten the
            // hero a couple of times fights like a Numbria one from then on.
            const losses = useBattleStore.getState().losses[lossKey(enemy)] ?? 0;
            startBattle(atTier(enemy, mercyFor(losses, enemy.tier).fightTier), hp, maxHp);
            sendFlow({ type: 'ENCOUNTER' });
          },
          onSpire: () => sendFlow({ type: 'OPEN_SPIRE' }),
          onFog: (hint, id) => {
            // The Great Fogbank's first bump plays its panels instead (#75 item 14).
            if (id === GREAT_FOGBANK && !save.flags[GREAT_FOGBANK_MET]) setFlag(GREAT_FOGBANK_MET);
            else showToast(`🌫️ ${hint}`);
          },
          // Marlow's boat (#75 item 14): climbing in, going ashore.
          onBoard: (x, y) => update((s) => ({ ...s, aboard: true, pos: { x, y } })),
          onLand: (boat, x, y) =>
            update((s) => ({ ...s, aboard: false, boat: { zoneId: s.zoneId, ...boat }, pos: { x, y } })),
          onAshore: () => update((s) => ({ ...s, aboard: false, boat: null })),
          // The fog of Forgetting lifts on screen (#75 item 7), once per bank.
          onFogLift: (fog) => {
            sfx('gate'); // a way opening — not the level-up fanfare
            showToast(fog.lifted);
          },
          onFogRevealed: (id) => setFlag(fogSeenFlag(id)),
          onDark: () =>
            showToast(
              knowsGlow ? '🌑 Too dark to go on! Tap 🔆 Glow at the top to light the way.' : `🌑 ${z.dark?.hint ?? "It's too dark!"}`,
            ),
          onCalmTick: (left) => {
            setCalmLeft(left);
            if (left === 0) showToast('🕊️ The calm wears off — the critters are curious again!');
          },
          onWard: (id) => spireBump({ kind: 'ward', id }),
          onStairs: () => spireBump({ kind: 'stairs' }),
          onUmbra: () => spireBump({ kind: 'umbra' }),
          onSecret: (id) => {
            const secret = secretById(id);
            if (!secret || save.flags[secretFlag(id)]) return;
            update((s) => claimSecret(s, secret));
            sfx('chest');
            setFound(secret);
          },
        }}
        spireFloor={spireTheme}
        spireBroken={spireBroken}
        spireLight={spireTheme ? { lives: spireLives, max: SPIRE_LIVES } : null}
        travelRef={travelRef}
        calmRef={calmRef}
        boat={boatSpot(save)}
        aboard={save.aboard}
      />

      <p className="text-white/50 text-xs mt-2">
        Walk: arrow keys / WASD · bump into friends to talk, foes to battle!
      </p>
      </div>
      <TouchPad onDirChange={onDirChange} />

      {/* Toast — inside a live region that's always there, so screen readers
          announce each one as it appears. */}
      <div role="status" aria-live="polite">
        {toast && (
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="fixed bottom-8 bg-white text-gray-800 font-semibold rounded-xl px-5 py-2.5 shadow-2xl z-50"
          >
            {toast}
          </motion.div>
        )}
      </div>

      {/* Secret found */}
      {found && (
        <motion.button
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setFound(null)}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-b from-amber-200 to-amber-100 text-amber-950 border-4 border-amber-400 rounded-2xl px-6 py-4 shadow-2xl text-center max-w-sm"
        >
          <div className="text-xs font-extrabold uppercase tracking-widest text-amber-700">✨ Secret found! ✨</div>
          <p className="font-semibold mt-1">{found.text}</p>
          <p className="text-sm font-bold mt-2">{rewardSummary(found)}</p>
        </motion.button>
      )}

      {/* Overlays (machine substates) */}
      {overlay === 'dialogue' && npcId && <DialogueOverlay npcId={npcId} />}
      {overlay === 'service' && service && <ServiceOverlay service={service} npcId={npcId} />}
      {overlay === 'path' &&
        pathTarget &&
        (pathTarget.kind === 'keygate' ? (
          <KeyGateOverlay target={pathTarget} />
        ) : (
          <PathQuestionOverlay target={pathTarget} />
        ))}
      {overlay === 'menu' && <MenuOverlay calmLeft={calmLeft} onCast={castFieldSpell} />}
      {overlay === 'spire' && <SpireOverlay />}

      {/* Story cutscenes (#37 story pass + expansion) — one at a time. */}
      {activeScene === 'intro' && (
        <StoryPanels
          panels={INTRO_PANELS}
          doneLabel="🐲 Begin the adventure!"
          onDone={() => setFlag(INTRO_SEEN)}
        />
      )}
      {activeScene === 'hatch' && (
        <StoryPanels
          panels={HATCH_PANELS}
          doneLabel="🐲 Hello, Ember!"
          onDone={() => setFlag(EMBER_HATCH_SEEN)}
        />
      )}
      {activeScene === 'crystal' && crystalSceneTopic && (
        <StoryPanels
          panels={CRYSTAL_PANELS[crystalSceneTopic]}
          doneLabel="💎 A crystal restored!"
          onDone={() => setFlag(crystalSceneFlag(crystalSceneTopic))}
        />
      )}
      {activeScene === 'spire' && (
        <StoryPanels
          panels={SPIRE_PANELS}
          doneLabel="🏛️ Onward!"
          onDone={() => setFlag(SPIRE_AWAKE_SEEN)}
        />
      )}
      {activeScene === 'ending' && (
        <StoryPanels
          panels={endingPanels(avatar.name)}
          doneLabel="🗼 To the Spire!"
          onDone={() => setFlag(ENDING_SEEN)}
        />
      )}
      {activeScene === 'spireVictory' && (
        <StoryPanels
          panels={spireVictoryPanels(avatar.name)}
          doneLabel="🌟 The adventure continues!"
          onDone={() => setFlag(SPIRE_VICTORY_SEEN)}
        />
      )}
      {activeScene === 'dawnreach' && (
        <StoryPanels
          panels={DAWNREACH_PANELS}
          doneLabel="🗺️ Explore Dawnreach"
          onDone={() => setFlag(DAWNREACH_SEEN)}
        />
      )}
      {activeScene === 'act2' && (
        <StoryPanels panels={ACT2_PANELS} doneLabel="⛵ Find Old Marlow" onDone={() => setFlag(ACT2_SEEN)} />
      )}
      {activeScene === 'voyage' && (
        <StoryPanels panels={FIRST_VOYAGE_PANELS} doneLabel="⛵ Set sail!" onDone={() => setFlag(FIRST_VOYAGE_SEEN)} />
      )}
      {activeScene === 'fogbank' && (
        <StoryPanels panels={GREAT_FOGBANK_PANELS} doneLabel="🧭 Sail on" onDone={() => setFlag(GREAT_FOGBANK_SEEN)} />
      )}
      {activeScene === 'grove' && (
        <StoryPanels
          panels={GROVE_PANELS}
          doneLabel="🌙 Explore the grove"
          onDone={() => setFlag(GROVE_SEEN)}
        />
      )}
    </div>
  );
}
