/*
 * Hazel Quest public pages: sprite animation, the try-it battle, and Ember
 * growing as you scroll. No dependencies.
 *
 * Sprites come straight from the game's sheets (public/sprites/<id>/
 * {battle,world}.png). Frames are square, so a sheet's frame size is its
 * height and its frame count is width / height. Frame ranges match
 * tools/assets/README.md: battle idle 0-1, attack 2-4, hurt 5-6 (Ember also
 * breath 7-9, cheer 10-11); world idle 0-1, walk 2-5, idleDown 6-7.
 */
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ANIMS = {
    battle: { idle: [0, 1, 3], attack: [2, 4, 9], hurt: [5, 6, 7], breath: [7, 9, 8], cheer: [10, 11, 5] },
    world: { idle: [0, 1, 3], walk: [2, 5, 8], idleDown: [6, 7, 3], walkDown: [8, 11, 8] },
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- sound: the game's opening music and sound effects ----------
  //
  // The music is the game's opening intro (soft ripples that swell to a
  // climax): the same track its sign-in and setup screens play, so the site
  // and the way in sound like one opening. On by default, like the game.
  // Browsers hold sound until the first tap or key, so the music starts then. The speaker button turns it all off (or
  // on), and the choice is remembered on this device. Kids' page only.

  const sound = (() => {
    const off = { sfx() {} };
    if (!document.body.classList.contains('kids')) return off;
    const KEY = 'hq-site-sound';
    const MUSIC_VOLUME = 0.4; // the game's default music volume
    const SFX_VOLUME = 0.6;
    const read = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
    const save = (v) => { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* private mode */ } };

    let on = read();
    let started = false; // the browser has let the music play
    const music = new Audio('audio/16bit/music/intro.mp3');
    music.loop = true;
    music.preload = 'none';
    music.volume = MUSIC_VOLUME;
    const effects = new Map();

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-navy btn-sm sound-btn';
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'sr-only';
    btn.append(icon, label);
    const show = () => {
      // Pressed = sound on. Until the first tap it's on but silent, so it
      // still shows the speaker: tapping it starts the music.
      icon.textContent = on ? '🔊' : '🔇';
      label.textContent = 'Sound';
      btn.setAttribute('aria-pressed', String(on));
      btn.title = on ? 'Sound on — tap to turn it off' : 'Sound off — tap to turn it on';
    };
    document.body.append(btn);
    show();

    const startMusic = () => {
      if (!on || document.hidden) return;
      music.play().then(() => { started = true; }).catch(() => { /* still blocked: next tap */ });
    };
    const stopMusic = () => music.pause();

    // The first tap or key anywhere starts the music (not the speaker
    // button's own tap, which decides for itself below).
    const unlock = (e) => {
      if (started || btn.contains(e.target)) return;
      startMusic();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    btn.addEventListener('click', () => {
      // Sound is on but hasn't been heard yet: this tap starts it.
      if (on && !started) { startMusic(); return; }
      on = !on;
      save(on);
      show();
      if (on) startMusic(); else stopMusic();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopMusic();
      else if (on && started) startMusic();
    });

    return {
      sfx(name) {
        if (!on) return;
        let base = effects.get(name);
        if (!base) {
          base = new Audio(`audio/16bit/sfx/${name}.mp3`);
          base.volume = SFX_VOLUME;
          effects.set(name, base);
        }
        // A copy each time, so quick taps overlap instead of cutting off.
        const a = base.cloneNode();
        a.volume = SFX_VOLUME;
        a.play().catch(() => {});
      },
    };
  })();

  // ---------- sprites ----------

  const sprites = new Map();
  const sheets = new Map();
  const seen = new IntersectionObserver(
    (entries) => entries.forEach((e) => { const st = sprites.get(e.target); if (st) st.visible = e.isIntersecting; }),
    { rootMargin: '120px' },
  );

  function loadSheet(url) {
    if (!sheets.has(url)) {
      sheets.set(url, new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ size: img.naturalHeight, n: Math.round(img.naturalWidth / img.naturalHeight) });
        img.onerror = () => resolve(null);
        img.src = url;
      }));
    }
    return sheets.get(url);
  }

  function setSheet(el, id) {
    const url = `sprites/${id}/${el.dataset.sheet || 'battle'}.png`;
    el.dataset.spr = id;
    el.style.backgroundImage = `url("${url}")`;
    return loadSheet(url).then((m) => {
      if (!m || el.dataset.spr !== id) return;
      el.style.setProperty('--fw', m.size);
      el.style.setProperty('--fh', m.size);
      el.style.setProperty('--n', m.n);
    });
  }

  function register(el) {
    const st = {
      el,
      table: ANIMS[el.dataset.sheet || 'battle'],
      anim: el.dataset.anim || 'idle',
      t0: performance.now() - Math.random() * 1500,
      once: false,
      then: 'idle',
      done: null,
      visible: true,
      f: -1,
    };
    sprites.set(el, st);
    setSheet(el, el.dataset.spr);
    seen.observe(el);
  }

  /** Play a one-shot animation, then go back to `then`. Resolves when it ends. */
  function play(el, anim, then = 'idle') {
    const st = sprites.get(el);
    if (!st) return Promise.resolve();
    if (st.done) st.done();
    st.anim = anim;
    st.then = then;
    st.once = true;
    st.t0 = performance.now();
    return new Promise((resolve) => { st.done = resolve; });
  }

  function frameFor(st, now) {
    const [a, b, fps] = st.table[st.anim] || st.table.idle;
    const len = b - a + 1;
    const k = Math.floor(((now - st.t0) / 1000) * fps);
    if (st.once) {
      if (k < len) return a + k;
      st.once = false;
      st.anim = st.then;
      st.t0 = now;
      const done = st.done;
      st.done = null;
      if (done) done();
      return (st.table[st.anim] || st.table.idle)[0];
    }
    return reduce.matches ? a : a + (k % len);
  }

  function tick(now) {
    for (const st of sprites.values()) {
      if (!st.visible && !st.once) continue;
      const f = frameFor(st, now);
      if (f !== st.f) {
        st.f = f;
        st.el.style.setProperty('--f', f);
      }
    }
    requestAnimationFrame(tick);
  }

  document.querySelectorAll('.spr[data-spr]').forEach(register);
  requestAnimationFrame(tick);

  // ---------- the title screen's backdrop: a whole-number zoom that covers it ----------

  const title = document.querySelector('.title');
  if (title) {
    const fit = () => title.style.setProperty('--bds', Math.max(3, Math.ceil(title.offsetHeight / 144)));
    new ResizeObserver(fit).observe(title);
    fit();
  }

  // ---------- tap a hero, a dragon, a critter ----------

  document.querySelectorAll('[data-play-anim]').forEach((btn) => {
    const spr = btn.querySelector('.spr');
    const SFX = { attack: 'attack', hurt: 'hit', cheer: 'select', breath: 'roar' };
    btn.addEventListener('click', () => {
      play(spr, btn.dataset.playAnim);
      sound.sfx(SFX[btn.dataset.playAnim] || 'select');
    });
  });

  document.querySelectorAll('.critter-btn').forEach((btn) => {
    const spr = btn.querySelector('.spr');
    let timer = 0;
    btn.addEventListener('click', () => {
      play(spr, 'hurt');
      sound.sfx('hit');
      document.querySelectorAll('.critter-btn.named').forEach((b) => b !== btn && b.classList.remove('named'));
      btn.classList.add('named');
      clearTimeout(timer);
      timer = setTimeout(() => btn.classList.remove('named'), 1800);
    });
  });

  // ---------- the try-it battle ----------

  // Hand-written sample questions for the demo. The real game writes its own,
  // matched to each child's age and level.
  const BANK = [
    { topic: 'Math', q: 'You have 3 bags with 4 gems in each. How many gems?', a: ['12', '7', '10', '16'], why: '3 bags of 4 is 4 + 4 + 4 = 12.' },
    { topic: 'Space', q: 'Which planet is called the Red Planet?', a: ['Mars', 'Venus', 'Jupiter', 'Neptune'], why: 'Mars is covered in reddish dust.' },
    { topic: 'Nature & Animals', q: 'Which of these animals is a mammal?', a: ['Dolphin', 'Shark', 'Octopus', 'Jellyfish'], why: 'Dolphins breathe air and feed their babies milk.' },
    { topic: 'Words & Stories', q: 'Which word rhymes with “light”?', a: ['Kite', 'Late', 'Lift', 'Loud'], why: 'Light and kite end with the same sound.' },
    { topic: 'Maps & Places', q: 'Which is the biggest ocean on Earth?', a: ['Pacific', 'Atlantic', 'Indian', 'Arctic'], why: 'The Pacific is bigger than all the land on Earth put together.' },
    { topic: 'Science', q: 'What do plants need from the Sun to make their food?', a: ['Light', 'Sand', 'Salt', 'Snow'], why: 'Plants use sunlight to turn water and air into food.' },
    { topic: 'Music', q: 'How many strings does a violin have?', a: ['4', '6', '2', '10'], why: 'A violin has four strings: G, D, A and E.' },
    { topic: 'Engineering', q: 'A see-saw is which simple machine?', a: ['A lever', 'A pulley', 'A spring', 'A magnet'], why: 'Push one end of a lever down and the other end goes up.' },
    { topic: 'Time & History', q: 'What did baby dinosaurs hatch from?', a: ['Eggs', 'Seeds', 'Cocoons', 'Pebbles'], why: 'Dinosaurs laid eggs, just like birds do today.' },
    { topic: 'Math', q: 'What is 9 + 6?', a: ['15', '14', '16', '13'], why: 'Make 10 first: 9 + 1 = 10, then 5 more is 15.' },
  ];
  const FOES = [
    { id: 'sum-slime', name: 'Sum Slime', bg: 'numbria' },
    { id: 'comet-crab', name: 'Comet Crab', bg: 'verdara' },
    { id: 'grumblebee', name: 'Grumblebee', bg: 'whispering-woods' },
    { id: 'bubble-puffer', name: 'Bubble Puffer', bg: 'silver-shallows-sea' },
    { id: 'doodle-imp', name: 'Doodle Imp', bg: 'chromaria' },
    { id: 'bolt-mouse', name: 'Bolt Mouse', bg: 'gearfall' },
  ];
  const FOE_HP = 30;
  const HITS = [11, 10, 9];

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const battle = document.querySelector('[data-battle]');
  if (battle) {
    const $ = (s) => battle.querySelector(s);
    const stage = $('.stage');
    const foe = $('[data-foe]');
    const hero = $('[data-hero]');
    const foeSpr = foe.querySelector('.spr');
    const heroSpr = hero.querySelector('.spr');
    const buddySpr = $('.buddy-in-battle .spr');
    const foeName = $('[data-foe-name]');
    const foeHp = $('[data-foe-hp]');
    const heroHpText = $('.hud-hero .row span:last-child');
    const heroHp = $('.hud-hero .bar i');
    const topic = $('[data-topic]');
    const count = $('[data-count]');
    const qText = $('[data-q]');
    const answers = $('[data-answers]');
    const feedback = $('[data-feedback]');
    const next = $('[data-next]');

    // The first question is the one already on the page; the rest come shuffled.
    const order = [0, ...shuffle(BANK.map((_, i) => i).slice(1))];
    let qi = 0;
    let foeIdx = 0;
    let hits = 0;
    let hp = FOE_HP;
    let heroLife = 100;
    let cur = null;
    let busy = false;
    let won = false;

    const floatText = (text, over, cls) => {
      const el = document.createElement('span');
      el.className = `float outlined ${cls || ''}`;
      el.textContent = text;
      el.style.left = `${over.offsetLeft + over.offsetWidth / 2 - 24}px`;
      el.style.top = `${over.offsetTop - 10}px`;
      stage.append(el);
      setTimeout(() => el.remove(), 950);
    };
    const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const say = (strong, rest) => {
      const b = document.createElement('b');
      b.textContent = strong;
      feedback.replaceChildren(b, ` ${rest}`);
    };

    function setFoe() {
      const f = FOES[foeIdx % FOES.length];
      foeName.textContent = f.name;
      setSheet(foeSpr, f.id);
      stage.style.backgroundImage = `url("backgrounds/${f.bg}.png")`;
      hp = FOE_HP;
      hits = 0;
      heroLife = 100;
      foeHp.style.width = '100%';
      heroHp.style.width = '100%';
      heroHpText.textContent = '100/100';
      foe.classList.remove('faint', 'shake');
      stage.querySelectorAll('.banner').forEach((b) => b.remove());
    }

    function ask() {
      cur = BANK[order[qi++ % order.length]];
      topic.textContent = cur.topic;
      count.textContent = `Hit ${hits + 1} of ${HITS.length}`;
      qText.textContent = cur.q;
      const opts = shuffle(cur.a.map((text, i) => ({ text, right: i === 0 })));
      answers.replaceChildren(...opts.map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'answer';
        b.textContent = o.text;
        if (o.right) b.dataset.right = '1';
        b.addEventListener('click', () => answer(b));
        return b;
      }));
      feedback.textContent = '';
      next.hidden = true;
      busy = false;
    }

    async function answer(btn) {
      if (busy) return;
      busy = true;
      const all = [...answers.children];
      all.forEach((b) => { b.disabled = true; });
      const right = all.find((b) => b.dataset.right);
      if (btn === right) {
        btn.classList.add('right');
        sound.sfx('correct');
        all.filter((b) => b !== btn).forEach((b) => b.classList.add('dim'));
        hero.classList.add('lunge-left');
        play(heroSpr, 'attack');
        sound.sfx('attack');
        await wait(260);
        const dmg = HITS[hits];
        hits += 1;
        hp = Math.max(0, hp - dmg);
        restart(foe, 'shake');
        play(foeSpr, 'hurt');
        sound.sfx('impact');
        floatText(`-${dmg}`, foe, 'hit');
        foeHp.style.width = `${(hp / FOE_HP) * 100}%`;
        await wait(240);
        hero.classList.remove('lunge-left');
        if (hits >= HITS.length) {
          won = true;
          play(buddySpr, 'cheer');
          sound.sfx('victory');
          await wait(300);
          foe.classList.add('faint');
          const banner = document.createElement('p');
          banner.className = 'banner outlined';
          banner.textContent = 'You won! +12 coins';
          stage.append(banner);
          say('You won!', cur.why);
          next.textContent = 'Next critter';
        } else {
          say('Right!', cur.why);
          next.textContent = 'Next question';
        }
      } else {
        btn.classList.add('wrong');
        right.classList.add('right');
        sound.sfx('wrong');
        foe.classList.add('lunge-right');
        play(foeSpr, 'attack');
        sound.sfx('enemyAttack');
        await wait(260);
        play(heroSpr, 'hurt');
        sound.sfx('hit');
        restart(hero, 'shake');
        heroLife = Math.max(10, heroLife - 6);
        heroHp.style.width = `${heroLife}%`;
        heroHpText.textContent = `${heroLife}/100`;
        floatText('-6', hero);
        await wait(240);
        foe.classList.remove('lunge-right');
        say(`The answer is ${right.textContent}.`, cur.why);
        next.textContent = 'Try another';
      }
      next.hidden = false;
      next.focus({ preventScroll: true });
    }

    next.addEventListener('click', () => {
      sound.sfx('select');
      if (won) {
        won = false;
        foeIdx += 1;
        setFoe();
      }
      ask();
      // Next has just hidden itself: put focus on the new question, so the
      // keyboard stays in the battle and a screen reader reads it out.
      qText.focus();
    });

    setFoe();
    ask();
  }

  // ---------- Ember grows as you scroll down the page ----------

  const buddy = document.querySelector('[data-buddy]');
  if (buddy) {
    const spr = buddy.querySelector('.spr');
    const bubble = buddy.querySelector('[data-say]');
    const sections = [...document.querySelectorAll('[data-ember]')];
    const finale = document.getElementById('play');
    const battleWin = document.querySelector('[data-battle]');
    const narrow = window.matchMedia('(max-width: 719px)');
    const LINES = {
      'ember-hatchling': ['Peep!', 'Hi! I’m Ember!'],
      'ember-whelp': ['Rawr!', 'Look, wings!'],
      'ember-dragon': ['RAWR!', 'Climb on. Let’s fly!'],
      'ember-radiant': ['I’m glowing!', 'To the Spire!'],
    };
    let stage = 'ember-egg';
    let taps = 0;
    let hatched = false;
    let sayTimer = 0;
    let ticking = false;

    const speak = (text) => {
      bubble.textContent = text;
      bubble.classList.add('on');
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => bubble.classList.remove('on'), 1800);
    };
    const hop = () => { buddy.classList.remove('pop'); void buddy.offsetWidth; buddy.classList.add('pop'); };

    const update = () => {
      ticking = false;
      let next = 'ember-egg';
      for (const s of sections) if (s.getBoundingClientRect().top < window.innerHeight * 0.6) next = s.dataset.ember;
      if (hatched && next === 'ember-egg') next = 'ember-hatchling';
      if (next !== stage) {
        stage = next;
        setSheet(spr, stage);
        hop();
      }
      // She steps away at the last Play button, and on a phone while the demo
      // battle passes under her corner, so a tap meant for an answer hits it.
      const atFinale = !!finale && finale.getBoundingClientRect().top < window.innerHeight * 0.85;
      let overBattle = false;
      if (battleWin && narrow.matches) {
        const r = battleWin.getBoundingClientRect();
        overBattle = r.top < window.innerHeight && r.bottom > window.innerHeight - 120;
      }
      buddy.classList.toggle('away', atFinale || overBattle);
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();

    buddy.addEventListener('click', () => {
      hop();
      if (stage === 'ember-egg') {
        taps += 1;
        if (taps < 5) { speak(taps === 4 ? '*crack*' : '*wobble*'); sound.sfx(taps === 4 ? 'shatter' : 'select'); return; }
        hatched = true;
        sound.sfx('levelup');
        update();
        speak('You found a secret!');
        return;
      }
      sound.sfx(stage === 'ember-dragon' || stage === 'ember-radiant' ? 'roar' : 'select');
      const lines = LINES[stage] || ['Rawr!'];
      speak(lines[Math.floor(Math.random() * lines.length)]);
    });
  }

  // ---------- Play buttons ----------

  const playUrl = document.querySelector('meta[name="hq:play-url"]')?.content || '/play/';
  document.querySelectorAll('[data-play]').forEach((a) => {
    a.href = playUrl;
    if (!playUrl.startsWith('#')) {
      // "Create a free family account" opens the game on its sign-up form
      // (AuthPage reads ?signup); every other Play button opens Sign in.
      if (a.dataset.play === 'signup') a.href = `${playUrl}${playUrl.includes('?') ? '&' : '?'}signup`;
      return;
    }
    // Prototype only: there is no game behind the button yet.
    a.addEventListener('click', (e) => {
      e.preventDefault();
      let note = document.querySelector('.proto-note');
      if (!note) {
        note = document.createElement('p');
        note.className = 'proto-note window';
        note.setAttribute('role', 'status');
        document.body.append(note);
      }
      note.textContent = 'Prototype: on the real site this button opens the game, where a grown-up makes the free family account.';
      note.hidden = false;
      clearTimeout(note.timer);
      note.timer = setTimeout(() => { note.hidden = true; }, 5000);
    });
  });

  // ---------- A link to a FAQ answer opens it ----------

  const openTarget = (hash) => {
    let id = '';
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const el = id && document.getElementById(id);
    if (el && el.tagName === 'DETAILS') el.open = true;
  };
  openTarget(location.hash);
  window.addEventListener('hashchange', () => openTarget(location.hash));
  // A second click on the same link changes no hash, so links open it too.
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', () => openTarget(a.hash)));
})();

// Under reduced motion the gameplay clip waits for Play (its controls are always shown).
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('video[data-autoplay]').forEach((v) => {
    if (!reduce.matches) return;
    v.removeAttribute('autoplay');
    v.pause();
  });
})();
