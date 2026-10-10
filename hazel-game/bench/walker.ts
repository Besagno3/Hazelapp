/**
 * The bench's walker (#75 item 14b): steers the real hero — real hitboxes,
 * gates, exits, transitions — cell by cell along a path from `lib/reach.ts`,
 * the way a child holding the d-pad would. Dev-only, like the rest of bench/.
 *
 * It needs nothing from the game but what any player has: a direction to
 * hold (the touch pad's ref) and a pause button. Pausing makes the canvas
 * report where the hero really is (`onMove`), so the walker holds a direction
 * for the time the distance takes at walking speed, pauses to see where it
 * got to, and corrects with short taps. Resuming starts the canvas's 0.8 s
 * trigger cooldown, so before bumping a gate or a boss it waits that out.
 */
import { TILE, tileAt, type ZoneDef, type ZoneId } from '../src/content/zones';
import type { Cell, Step } from '../src/lib/reach';

/** The hero's walking speed (px/s), as `WorldCanvas`'s SPEED. */
const SPEED = 170;
/** Close enough to a cell's centre (px) to turn into a one-tile corridor (the hitbox leaves ±5). */
const NEAR = 4;
/** The canvas's trigger cooldown after a pause, plus a little. */
const COOLDOWN_MS = 900;
/** Wait after a zone change for its slide / fade to finish. */
const ARRIVE_MS = 1500;

export interface WalkerIO {
  /** The direction held, as the touch pad sets it. */
  touch: { current: { dx: number; dy: number } };
  pause: (on: boolean) => void;
  /** Where the canvas last said the hero is, and how often it has said so. */
  where: () => { zoneId: ZoneId; pos: { x: number; y: number } | null; moves: number };
  zone: (id: ZoneId) => ZoneDef;
}

export interface HopReport {
  zoneId: ZoneId;
  cells: number;
  ms: number;
  ok: boolean;
  /** Why it stopped, and where (cell), when it didn't make it. */
  stuck?: { reason: string; at: Cell | null; step: number };
  /** One-tile turns the hero had to correct more than once to make. */
  tightTurns: Cell[];
  /** The last probes and holds, for a stuck walk. */
  trace?: string[];
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const centre = (c: Cell) => ({ x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 });
const cellOf = (p: { x: number; y: number }) => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });

export function makeWalker(io: WalkerIO) {
  let lastProbe = 0;
  let trace: string[] = [];
  const note = (s: string) => {
    trace.push(s);
    if (trace.length > 24) trace.shift();
  };

  /** Pause, let the canvas say where the hero is, resume. */
  async function probe(): Promise<{ x: number; y: number }> {
    const before = io.where().moves;
    io.pause(true);
    for (let i = 0; i < 30 && io.where().moves === before; i++) await frame();
    const p = io.where().pos;
    io.pause(false);
    await frame();
    lastProbe = performance.now();
    note(`at ${p ? `${Math.round(p.x)},${Math.round(p.y)}` : '?'}${io.where().moves === before ? ' (stale)' : ''}`);
    return p ?? { x: 0, y: 0 };
  }

  /** Hold a direction for `ms` (at least one frame), then let go. */
  async function hold(dx: number, dy: number, ms: number) {
    note(`hold ${dx},${dy} ${Math.round(ms)}ms`);
    io.touch.current = { dx, dy };
    const end = performance.now() + ms;
    await frame();
    while (performance.now() < end) await frame();
    io.touch.current = { dx: 0, dy: 0 };
    await frame();
  }

  /** Let the post-pause cooldown run out, so the next bump counts. */
  async function cooled() {
    const left = COOLDOWN_MS - (performance.now() - lastProbe);
    if (left > 0) await sleep(left);
  }

  /**
   * Walk a straight run to `goal` (moving along `d`), arriving within NEAR px
   * of its centre. `bump`: the run crosses a gate, so let the cooldown lapse
   * first (the bump is what opens it).
   */
  async function run(goal: Cell, d: Cell, bump: boolean, turns: Cell[], done?: () => boolean): Promise<string | null> {
    const g = centre(goal);
    let tries = 0;
    for (; tries < 10; tries++) {
      // Walked into the target on the way (a boss notices you from beside it): the hop's done.
      if (done?.()) return null;
      const p = await probe();
      const perp = d.x !== 0 ? g.y - p.y : g.x - p.x;
      if (Math.abs(perp) > NEAR) {
        const ms = (Math.abs(perp) / SPEED) * 1000;
        if (d.x !== 0) await hold(0, Math.sign(perp), ms);
        else await hold(Math.sign(perp), 0, ms);
        continue;
      }
      const along = d.x !== 0 ? g.x - p.x : g.y - p.y;
      if (Math.abs(along) <= NEAR) break;
      if (bump && tries === 0) await cooled();
      const ms = (Math.abs(along) / SPEED) * 1000;
      if (d.x !== 0) await hold(Math.sign(along), 0, ms);
      else await hold(0, Math.sign(along), ms);
    }
    if (tries >= 10) return 'never reached the cell';
    if (tries > 3) turns.push(goal);
    return null;
  }

  /**
   * Walk a hop's path. Its last step is an exit (then the zone must change
   * to `to`), or the cell beside a target (then `touch` pushes into it until
   * `touched()` says the game noticed).
   */
  async function walk(
    path: Step[],
    opts: { to?: ZoneId | null; target?: Cell; touched?: () => boolean },
  ): Promise<HopReport> {
    const t0 = performance.now();
    trace = [];
    const from = io.where().zoneId;
    const z = io.zone(from);
    const turns: Cell[] = [];
    const report = (ok: boolean, stuck?: HopReport['stuck']): HopReport => ({
      zoneId: from,
      cells: path.length,
      ms: Math.round(performance.now() - t0),
      ok,
      stuck,
      tightTurns: turns,
      trace: ok ? undefined : [...trace],
    });
    let i = 1;
    while (i < path.length) {
      if (opts.touched?.()) return report(true);
      const a = path[i - 1];
      const d = { x: path[i].x - a.x, y: path[i].y - a.y };
      let j = i;
      while (j + 1 < path.length && path[j + 1].x - path[j].x === d.x && path[j + 1].y - path[j].y === d.y) j++;
      const isExit = opts.to && j === path.length - 1;
      if (isExit) {
        // Into the exit: hold on until the zone changes (exits don't wait for the cooldown).
        const goal = centre(path[j]);
        for (let tries = 0; tries < 8 && io.where().zoneId === from; tries++) {
          const p = await probe();
          if (io.where().zoneId !== from) break;
          const along = d.x !== 0 ? goal.x - p.x : goal.y - p.y;
          const ms = ((Math.abs(along) + TILE / 2) / SPEED) * 1000;
          if (d.x !== 0) await hold(Math.sign(along) || d.x, 0, ms);
          else await hold(0, Math.sign(along) || d.y, ms);
        }
        if (io.where().zoneId === from) return report(false, { reason: 'exit never fired', at: cellOf((await probe())), step: j });
        if (io.where().zoneId !== opts.to) return report(false, { reason: `came out in ${io.where().zoneId}`, at: null, step: j });
        await sleep(ARRIVE_MS);
        return report(true);
      }
      const crossesGate = path.slice(i, j + 1).some((c) => tileAt(z, c.x, c.y) === 'G');
      const why = await run(path[j], d, crossesGate, turns, opts.touched);
      if (why) return report(false, { reason: why, at: cellOf(await probe()), step: j });
      i = j + 1;
    }
    if (opts.target && opts.touched) {
      // Beside the target: wait out the cooldown, then walk into it until the game notices.
      for (let tries = 0; tries < 4 && !opts.touched(); tries++) {
        await cooled();
        if (opts.touched()) break;
        // Straight from the path's last cell towards the target — never a slant that slides off the path.
        const last = path[path.length - 1];
        const dx = Math.sign(opts.target.x - last.x);
        const dy = dx ? 0 : Math.sign(opts.target.y - last.y);
        await hold(dx, dy, 400);
        for (let w = 0; w < 10 && !opts.touched(); w++) await frame();
        if (!opts.touched()) await probe();
      }
      if (!opts.touched()) return report(false, { reason: 'target never noticed', at: cellOf(await probe()), step: path.length - 1 });
    }
    return report(true);
  }

  /** Wait until the world is running (the canvas answers a pause), up to `ms`. */
  async function ready(ms = 30000) {
    const end = performance.now() + ms;
    while (io.where().moves === 0 && performance.now() < end) {
      await probe();
      if (io.where().moves === 0) await sleep(250);
    }
    return io.where().moves > 0;
  }

  return { walk, probe, ready };
}
