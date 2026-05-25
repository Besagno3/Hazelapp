import { useEffect, useRef, useState } from 'react';
import kaplay, { type GameObj, type AreaComp } from 'kaplay';
import { useGameStore } from '../../store/gameStore';
import { useProfileStore } from '../../store/profileStore';
import { calcAge } from '../../lib/age';
import { generateNpcs } from '../../lib/npc';
import { hpBonus } from '../../lib/powerups';
import { prefetchQuestions, BATTLE_QUESTION_COUNT } from '../../lib/questions';
import type { NPC, Topic } from '../../types';

/** Age used when no profile is loaded yet. */
const DEFAULT_AGE = 10;
/** Canvas dimensions — a single Zelda-1-style "screen". */
const W = 640;
const H = 480;
/** Player movement speed (px/sec). */
const SPEED = 200;

/** Background tint by NPC topic — quick visual cue while real sprites land. */
const TOPIC_TINT: Record<Topic, [number, number, number]> = {
  math: [110, 150, 220],
  science: [120, 200, 140],
  engineering: [240, 180, 100],
  creativity: [240, 140, 200],
};

/** NPCs spawn at the four corners; player spawns at the center. */
const SPAWN_CORNERS: [number, number][] = [
  [120, 120],
  [W - 120, 120],
  [120, H - 120],
  [W - 120, H - 120],
];

/**
 * Open-world map (#36 MVP) — Zelda-1-style single screen rendered on a KaPlay
 * canvas. The player walks an avatar with arrow keys / WASD; bumping into an
 * NPC triggers the existing battle flow via the game store.
 *
 * Placeholder graphics (colored rounded rects with emoji labels) until a real
 * tileset + sprite sheets land. The KaPlay context is created on mount and
 * `quit()`-ed on unmount so it doesn't leak between phase switches.
 */
export default function WorldMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startBattle = useGameStore((s) => s.startBattle);
  const setPhase = useGameStore((s) => s.setPhase);
  const avatar = useGameStore((s) => s.avatar);
  const profile = useProfileStore((s) => s.profile);
  const age = profile ? calcAge(profile.birthYear, profile.birthMonth) : DEFAULT_AGE;
  const [npcs] = useState<NPC[]>(() => generateNpcs(age, SPAWN_CORNERS.length));

  // Warm each NPC's battle questions while the player browses the map.
  useEffect(() => {
    for (const npc of npcs) {
      prefetchQuestions(npc.topic, age, npc.level, BATTLE_QUESTION_COUNT);
    }
  }, [npcs, age]);

  useEffect(() => {
    if (!canvasRef.current || !avatar) return;

    const k = kaplay({
      canvas: canvasRef.current,
      width: W,
      height: H,
      background: [80, 160, 100],
      global: false,
      crisp: true,
      letterbox: true,
    });

    // Player — yellow rounded square with the avatar's emoji on top.
    const player = k.add([
      k.rect(32, 32, { radius: 6 }),
      k.color(255, 220, 100),
      k.outline(2, k.rgb(120, 80, 0)),
      k.pos(W / 2, H / 2),
      k.anchor('center'),
      k.area(),
      'player',
    ]);
    player.add([k.text(avatar.sprite, { size: 22 }), k.anchor('center')]);

    // NPCs at the four corners. Capture each `npc` in its closure so the
    // collision handler can pass the right one to startBattle.
    const npcObjs: { obj: GameObj<AreaComp>; npc: NPC }[] = [];
    npcs.forEach((npc, i) => {
      const [px, py] = SPAWN_CORNERS[i % SPAWN_CORNERS.length];
      const [r, g, b] = TOPIC_TINT[npc.topic];
      const npcObj = k.add([
        k.rect(40, 40, { radius: 6 }),
        k.color(r, g, b),
        k.outline(2, k.rgb(0, 0, 0)),
        k.pos(px, py),
        k.anchor('center'),
        k.area(),
        'npc',
      ]) as GameObj<AreaComp>;
      npcObj.add([k.text(npc.sprite, { size: 26 }), k.anchor('center')]);
      npcObj.add([
        k.text(`Lv ${npc.level}`, { size: 11 }),
        k.pos(0, 30),
        k.anchor('center'),
        k.color(255, 255, 255),
      ]);
      npcObjs.push({ obj: npcObj, npc });
    });

    // One-shot guard: ignore further collisions once a battle is starting.
    let triggered = false;

    k.onUpdate(() => {
      if (triggered) return;
      const dt = k.dt();

      let dx = 0;
      let dy = 0;
      if (k.isKeyDown('left') || k.isKeyDown('a')) dx -= 1;
      if (k.isKeyDown('right') || k.isKeyDown('d')) dx += 1;
      if (k.isKeyDown('up') || k.isKeyDown('w')) dy -= 1;
      if (k.isKeyDown('down') || k.isKeyDown('s')) dy += 1;
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.sqrt(2);
        dx *= inv;
        dy *= inv;
      }

      // Move + clamp to the map (no tile collision yet).
      player.pos.x = Math.max(20, Math.min(W - 20, player.pos.x + dx * SPEED * dt));
      player.pos.y = Math.max(20, Math.min(H - 20, player.pos.y + dy * SPEED * dt));

      // Manual overlap check — more reliable than kaplay's tag-based
      // onCollide for closure-captured `npc` data.
      for (const { obj, npc } of npcObjs) {
        if (player.isColliding(obj)) {
          triggered = true;
          startBattle(npc, avatar.maxHp + hpBonus(profile?.powerUps ?? {}));
          break;
        }
      }
    });

    return () => {
      k.quit();
    };
  }, [avatar, profile, npcs, startBattle]);

  // Defensive: App.tsx routes through AvatarSelect first when the world
  // unlocks, so this shouldn't normally render.
  if (!avatar) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-700 to-teal-900 p-6">
        <p className="text-white mb-4">Pick an avatar first to enter the world.</p>
        <button
          onClick={() => setPhase('topic-select')}
          className="bg-white text-emerald-700 font-semibold rounded-lg px-5 py-2"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-br from-emerald-700 to-teal-900 p-4 pt-20">
      <h1 className="text-3xl font-extrabold text-white mb-1">Open World</h1>
      <p className="text-emerald-100 mb-3 text-sm">
        Walk to an NPC to challenge them · arrow keys / WASD
      </p>
      <canvas
        ref={canvasRef}
        className="rounded-lg shadow-2xl border-2 border-emerald-300/30 max-w-full"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
