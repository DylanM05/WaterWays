// The animated river behind the search field: uneven banks, a pale shallow margin, drifting current streaks,
// foam along the banks, and a duck, fishing bobbers and fish that pass by now and then.
//
// attachRiver(label) draws into label's .river-search__water element, sized to the label, and redraws when
// the label changes width. Every proportion is a fraction of the river's height or width, so the same code
// draws the home page river and the small one in the top bar. It returns a function that stops everything.

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const between = (range) => range[0] + Math.random() * (range[1] - range[0]);
const setRate = (animation, rate) => {
  if (animation.updatePlaybackRate) animation.updatePlaybackRate(rate);
  else animation.playbackRate = rate;
};

// How an animation follows the current, which runs at 1, or faster while the field has focus. Things the water
// carries speed up with it; a creature's own movements (a bite, paddling, a tail beat) keep their pace; a fish
// working against the current beats its tail a little faster.
const WITH_CURRENT = (current) => current;
const OWN_PACE = () => 1;
const EFFORT = (current) => 1 + (current - 1) * 0.3;

// A small seeded random generator, so a river keeps the same banks when it redraws.
function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A smooth curve through the points.
function smooth(pts) {
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d;
}

function geom(w, h) {
  return {
    bank: h * 0.115,
    amp: h * 0.067,
    shallow: h * 0.048,
    streaks: Math.max(4, Math.round((w * h) / 3400)),
    speed: [h * 0.25, h * 0.44],
    life: {
      scale: h / 74,
      lanes: [h * 0.32, h * 0.73],
      deep: [h * 0.4, h * 0.62],
      max: Math.max(1, Math.min(3, Math.round(w / 260))),
      gap: h < 50 ? [7000, 15000] : [4000, 10000],
      pace: Math.max(0.45, h / 104)
    }
  };
}

// Bobbers rock on the current; now and then a bite taps them, pulls them under, and they pop back up.
// Times are fractions of one cycle.
function bite(inner) {
  const D = between([3800, 6500]);
  const T = (y, r) => `translateY(${y}px) rotate(${r}deg)`;
  const body = [
    { offset: 0, transform: T(0, -4) },
    { offset: 0.3, transform: T(0.4, 4) },
    { offset: 0.6, transform: T(0, -4) },
    { offset: 0.68, transform: T(0, -2) },
    { offset: 0.7, transform: T(1.4, 0), easing: 'ease-out' },
    { offset: 0.73, transform: T(0, -1), easing: 'cubic-bezier(.55,0,.9,.45)' },
    { offset: 0.76, transform: T(6.5, 2) },
    { offset: 0.81, transform: T(5.8, -1), easing: 'cubic-bezier(.15,.85,.3,1)' },
    { offset: 0.855, transform: T(-2, -3), easing: 'ease-in-out' },
    { offset: 0.9, transform: T(0.9, 2) },
    { offset: 0.94, transform: T(-0.4, -3) },
    { offset: 1, transform: T(0, -4) }
  ];
  const wake = [
    { offset: 0, transform: 'scale(1)', opacity: 0.28 },
    { offset: 0.73, transform: 'scale(1)', opacity: 0.28, easing: 'ease-out' },
    { offset: 0.78, transform: 'scale(1.35)', opacity: 0.55, easing: 'ease-out' },
    { offset: 0.9, transform: 'scale(1.9)', opacity: 0 },
    { offset: 0.92, transform: 'scale(1)', opacity: 0, easing: 'ease-in' },
    { offset: 1, transform: 'scale(1)', opacity: 0.28 }
  ];
  const timing = { duration: D, iterations: Infinity, delay: -Math.random() * D };
  return [...inner.querySelectorAll('.r-bob-body')].map(b => b.animate(body, timing))
    .concat(inner.querySelector('.r-bob-wake').animate(wake, timing));
}

// The tail swings and the body flexes the other way.
function swim(inner) {
  const D = between([360, 460]);
  const timing = { duration: D, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: -Math.random() * D };
  return [
    inner.querySelector('.r-fish-tail').animate([{ transform: 'rotate(17deg)' }, { transform: 'rotate(-17deg)' }], timing),
    inner.querySelector('.r-fish-body').animate([{ transform: 'rotate(-3deg)' }, { transform: 'rotate(3deg)' }], timing)
  ];
}

// Against the current the tail beats faster and wider, and water parts at the nose and slides back along the body.
function swimHard(inner) {
  const D = between([210, 260]);
  const timing = { duration: D, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: -Math.random() * D };
  const W = between([620, 760]);
  return [
    inner.querySelector('.r-fish-tail').animate([{ transform: 'rotate(24deg)' }, { transform: 'rotate(-24deg)' }], timing),
    inner.querySelector('.r-fish-body').animate([{ transform: 'rotate(-4.5deg)' }, { transform: 'rotate(4.5deg)' }], timing),
    inner.querySelector('.r-fish-wake').animate([
      { transform: 'translateX(1.5px) scaleY(.7)', opacity: 0 },
      { offset: 0.25, opacity: 1 },
      { transform: 'translateX(-5px) scaleY(1.15)', opacity: 0 }
    ], { duration: W, iterations: Infinity, easing: 'ease-out', delay: -Math.random() * W })
  ];
}

function paddle(inner) {
  return [inner.animate(
    [{ transform: 'translateY(-.8px) rotate(-3deg)' }, { transform: 'translateY(.8px) rotate(2deg)' }],
    { duration: 1700, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }
  )];
}

// Things that drift by, drawn facing downstream (right). The duck and bobbers float along the banks; fish
// swim under the surface, either way, and deeper ones are smaller and fainter. Fish heading upstream push
// against the current (see swimUpstream).
const LIFE = {
  bobber() {
    // Side view. The body is drawn twice and clipped at the waterline (y 1.5): solid above, faint below,
    // so when a bite pulls it under, the red cap really disappears into the river.
    const id = `wwbb${uid++}`;
    const body = '<g class="r-bob-body"><path d="M-6,0A6,6 0 0 0 6,0Z" class="r-bob-low"/><path d="M-6,0A6,6 0 0 1 6,0Z" class="r-bob-top"/><path d="M-6,0H6" class="r-bob-band"/><rect x="-.9" y="-10.5" width="1.8" height="5" rx=".9" class="r-bob-low"/><ellipse cx="-2.3" cy="-3.2" rx="1.6" ry="1" class="r-bob-shine"/></g>';
    return {
      speed: 1,
      animate: bite,
      svg: `<defs><clipPath id="${id}a"><rect x="-20" y="-30" width="40" height="31.5"/></clipPath><clipPath id="${id}b"><rect x="-20" y="1.5" width="40" height="20"/></clipPath></defs>`
        + `<g clip-path="url(#${id}b)" opacity=".3">${body}</g><ellipse cx="0" cy="1.8" rx="9.5" ry="2.4" class="r-wake r-bob-wake"/><g clip-path="url(#${id}a)">${body}</g>`
    };
  },
  duck() {
    return {
      speed: 1.25,
      animate: paddle,
      svg: '<path d="M-17,5Q-7,9 5,6" class="r-wake"/><path d="M-12,1C-12,-6 -2,-7 6,-4C10,-3 11,1 9,4C4,7 -8,7 -12,1Z" class="r-duck"/><path d="M-12,0L-15.5,-4.5L-10,-2.2Z" class="r-duck-tail"/><path d="M-7,-1C-3,-4 3,-3.4 4,0C0,2 -5,2 -7,-1Z" class="r-wing"/><circle cx="7" cy="-8" r="4.6" class="r-head"/><path d="M3.6,-4.4L9,-4.2" class="r-collar"/><path d="M11,-8.6L15.6,-7.4L11,-6.2Z" class="r-beak"/><circle cx="8.6" cy="-9.2" r=".9" class="r-eye"/>'
    };
  },
  fish() {
    const upstream = Math.random() < 0.5;
    const depth = Math.random();
    const opacity = 0.56 - depth * 0.28;
    // Two thin lines that part at the nose and run back past the fins.
    const wake = upstream
      ? `<g class="r-fish-wake" stroke-opacity="${(opacity * 0.75).toFixed(2)}"><path d="M13,-1Q9,-4.4 2.5,-5.8"/><path d="M13,1Q9,4.4 2.5,5.8"/></g>`
      : '';
    return {
      speed: upstream ? -1.1 : 1.9,
      against: upstream,
      deep: true,
      wander: true,
      size: 1.12 - depth * 0.3,
      animate: upstream ? swimHard : swim,
      svg: `${wake}<g class="r-fish" fill-opacity="${opacity.toFixed(2)}"><g class="r-fish-tail"><path d="M-9.5,0L-16.5,-5.2Q-14.4,0 -16.5,5.2Z"/></g>`
        + '<g class="r-fish-body"><path d="M11,0C9.6,-3 4,-4.2 -2,-3.6C-6,-3.1 -8.8,-1.8 -10.4,0C-8.8,1.8 -6,3.1 -2,3.6C4,4.2 9.6,3 11,0Z"/><path d="M3.6,-3.5L-.4,-6.8L-1.8,-3.6ZM3.6,3.5L-.4,6.8L-1.8,3.6Z"/></g></g>'
    };
  }
};
const KINDS = ['bobber', 'bobber', 'duck', 'fish', 'fish'];

let nextSeed = 3;

export function attachRiver(label) {
  const el = label.querySelector('.river-search__water');
  const input = label.querySelector('input');
  const round = label.dataset.ends === 'round';
  const seed = nextSeed;
  nextSeed += 5;
  const calm = !el.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const st = { w: 0, h: 0, gen: 0, rate: 1, anims: [], live: 0, seen: true, layer: null, o: null, sid: '' };
  const timers = new Set();
  let destroyed = false;

  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };
  const pace = new WeakMap();
  const track = (animation, follows = WITH_CURRENT) => {
    pace.set(animation, follows);
    setRate(animation, follows(st.rate));
    if (!st.seen) animation.pause();
    st.anims.push(animation);
  };
  const untrack = (animation) => {
    const index = st.anims.indexOf(animation);
    if (index > -1) st.anims.splice(index, 1);
  };

  // A streak is a short tapered glint that fades in, drifts and fades out, then starts again somewhere new.
  // As in a real river, the middle of the channel runs fastest and carries the longest streaks.
  function stream(g, first, gen) {
    if (gen !== st.gen || destroyed) return;
    const { o, w, h } = st;
    const y = between([h * 0.24, h * 0.76]);
    const t = (y - h / 2) / (h * 0.27);
    const f = Math.max(0.3, 1 - 0.7 * t * t);
    const v = o.speed[1] * f * between([0.85, 1.15]);
    const L = h * (0.2 + 0.45 * f) * between([0.8, 1.2]);
    const bow = h * 0.012 * between([0.4, 1.2]) * (Math.random() < 0.5 ? -1 : 1);
    const travel = L * between([2.5, 5]);
    const x0 = between([-L, w - travel * 0.4]);
    const peak = +(0.22 + 0.36 * f).toFixed(2);
    const path = g.firstChild;
    path.setAttribute('stroke', `url(#${st.sid})`);
    path.setAttribute('d', `M0,0Q${f1(L / 2)},${f1(bow)} ${f1(L)},0`);
    path.setAttribute('stroke-width', f1(Math.max(0.9, h * (0.012 + 0.014 * f))));
    if (calm) {
      g.setAttribute('transform', `translate(${f1(x0 + travel / 2)},${f1(y)})`);
      g.setAttribute('opacity', peak);
      return;
    }
    const animation = g.animate([
      { transform: `translate(${f1(x0)}px,${f1(y)}px)`, opacity: 0 },
      { offset: 0.25, opacity: peak },
      { offset: 0.7, opacity: peak },
      { transform: `translate(${f1(x0 + travel)}px,${f1(y + bow * 0.6)}px)`, opacity: 0 }
    ], { duration: (travel / v) * 1000 });
    if (first) animation.currentTime = animation.effect.getTiming().duration * Math.random();
    track(animation);
    animation.onfinish = () => { untrack(animation); stream(g, false, gen); };
  }

  function spawn(head, gen) {
    if (gen !== st.gen || destroyed) return;
    const L = st.o.life, w = st.w, layer = st.layer;
    const c = LIFE[KINDS[Math.floor(Math.random() * KINDS.length)]]();
    const y = c.deep ? between(L.deep) : L.lanes[Math.random() < 0.5 ? 0 : 1] + (Math.random() - 0.5) * st.h * 0.04;
    const dir = c.speed < 0 ? -1 : 1;
    const from = dir > 0 ? -30 : w + 30;
    const to = dir > 0 ? w + 30 : -30;
    const speed = Math.abs(c.speed) * between([26, 34]) * L.pace;

    const g = document.createElementNS(NS, 'g');
    const scaleGroup = document.createElementNS(NS, 'g');
    const inner = document.createElementNS(NS, 'g');
    const size = L.scale * (c.size || 1);
    scaleGroup.setAttribute('transform', `scale(${f1(dir * size * 100) / 100},${f1(size * 100) / 100})`);
    inner.setAttribute('class', 'r-life');
    inner.innerHTML = c.svg;
    scaleGroup.appendChild(inner);
    g.appendChild(scaleGroup);
    layer.appendChild(g);
    st.live++;

    const done = (motions) => {
      if (gen !== st.gen) return;
      layer.removeChild(g);
      st.live--;
      motions.forEach(animation => { animation.cancel(); untrack(animation); });
    };
    const own = c.animate(inner);
    own.forEach(animation => track(animation, c.against ? EFFORT : OWN_PACE));

    // Fish follow a gentle wander between the depths, nose turned toward where they are heading.
    const amp = Math.min(st.h * 0.07, (L.deep[1] - L.deep[0]) / 2);
    const waves = between([2, 3.5]);
    const phase = Math.random() * 6;
    const wanderY = (x) => Math.min(L.deep[1], Math.max(L.deep[0], y + amp * Math.sin(((x - from) / (to - from)) * waves * Math.PI + phase)));
    const heading = (x) => (Math.atan((wanderY(x + 1) - wanderY(x - 1)) / 2) * 180) / Math.PI;
    const place = (x) => `translate(${f1(x)}px,${f1(wanderY(x))}px) rotate(${f1(heading(x))}deg)`;

    if (c.against) {
      swimUpstream(head ? from + (to - from) * between([0.15, 0.55]) : from);
      return;
    }

    let frames;
    let total;
    if (c.wander) {
      // Bursts and glides: each stretch at its own speed.
      const n = 14;
      frames = [];
      let time = 0;
      const times = [];
      for (let i = 0; i <= n; i++) {
        if (i) time += Math.abs(to - from) / n / (speed * between([0.55, 1.6]));
        times.push(time);
      }
      total = time;
      for (let i = 0; i <= n; i++) frames.push({ offset: times[i] / total, transform: place(from + ((to - from) * i) / n) });
    } else {
      total = Math.abs(to - from) / speed;
      frames = [
        { transform: `translate(${from}px,${f1(y)}px)` },
        { transform: `translate(${to}px,${f1(y + (Math.random() - 0.5) * st.h * 0.06)}px)` }
      ];
    }
    // Carried along, so it travels faster when the current picks up.
    const move = g.animate(frames, { duration: total * 1000, easing: 'linear' });
    // A creature already on the river when it first draws starts part-way across.
    if (head) move.currentTime = move.effect.getTiming().duration * between([0.15, 0.55]);
    track(move);
    move.onfinish = () => done([move, ...own]);

    // Against the current a fish swims in strokes: a lunge upstream, then a slide back as the current takes it,
    // nose still upstream. Each stroke reads the current as it starts, so when the river speeds up the fish is
    // pushed back further and gains less, though it still gets there. The lunge itself is the fish's own effort
    // and keeps its pace.
    function swimUpstream(x) {
      if (gen !== st.gen || destroyed) return;
      if ((to - x) * dir <= 0) { done(own); return; }
      const current = st.rate;
      const stretch = (Math.abs(to - from) / 14) * between([0.8, 1.2]);
      const duration = (stretch / (speed * between([0.55, 1.6]))) * 1000;
      // Now and then a clean stroke, less often in a strong current.
      const slip = Math.random() < 0.2 / current ? 0 : between([0.22, 0.42]);
      const lunge = stretch * (1 + slip) * (1 + 0.12 * (current - 1));
      const back = stretch * slip * current ** 1.3;
      const peak = x + dir * lunge;
      const end = peak - dir * back;
      const frames = slip
        ? [
          { transform: place(x), easing: 'cubic-bezier(.15,.75,.3,1)' },
          { offset: between([0.38, 0.48]), transform: place(peak), easing: 'ease-in-out' },
          { transform: place(end) }
        ]
        : [{ transform: place(x), easing: 'ease-out' }, { transform: place(peak) }];
      const stroke = g.animate(frames, { duration, fill: 'forwards' });
      track(stroke, OWN_PACE);
      stroke.onfinish = () => {
        swimUpstream(end);
        // The next stroke starts where this one ends, so dropping this one now doesn't jump.
        stroke.cancel();
        untrack(stroke);
      };
    }
  }

  function draw() {
    const w = label.offsetWidth, h = label.offsetHeight;
    if (destroyed || !w || (Math.abs(w - st.w) < 2 && h === st.h)) return;
    st.anims.forEach(animation => animation.cancel());
    st.anims = [];
    st.live = 0;
    st.gen++;
    st.w = w;
    st.h = h;
    const o = geom(w, h);
    st.o = o;
    const r = rng(seed);
    const ph = [r() * 6, r() * 6, r() * 6, r() * 6, r() * 6];

    const edge = (y0, sign, inset) => {
      const pts = [];
      const step = Math.max(8, Math.min(16, w / 40));
      for (let x = 0; x <= w + step; x += step) {
        const wobble = Math.sin(x / 97 + ph[sign > 0 ? 0 : 1]) * 0.6 + Math.sin(x / 41 + ph[sign > 0 ? 2 : 3]) * 0.4;
        const shallow = inset ? inset * (1 + 0.45 * Math.sin(x / 63 + ph[4])) : 0;
        pts.push([x, y0 + sign * (o.amp * wobble) + sign * shallow]);
      }
      return pts;
    };
    const body = (inset) => {
      const top = edge(o.bank, 1, inset);
      const bottom = edge(h - o.bank, -1, inset).reverse();
      return `${smooth(top)}L${f1(bottom[0][0])},${f1(bottom[0][1])} ${smooth(bottom).slice(1)}Z`;
    };

    const id = `wwrv${uid++}`;
    st.sid = `${id}s`;
    const k = h / 104;
    const water = body(o.shallow * 0.4);
    const deepStop = (offset, opacity) => `<stop offset="${offset}" style="stop-color:var(--w-water-deep)${opacity === undefined ? '' : `;stop-opacity:${opacity}`}"/>`;
    let s = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>`;
    s += `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--w-water)"/>${deepStop(0.5)}<stop offset="1" style="stop-color:var(--w-water)"/></linearGradient>`;
    // Streaks taper: solid through the middle, fading to nothing at both ends.
    s += `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".4" stop-color="#fff"/><stop offset=".6" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    // Calm water behind the text: deep water over the streaks, fading out above, below and past the end of
    // the field, so glints dim as they pass behind the words. Creatures still swim over it.
    const calmEnd = Math.min(w, input.offsetLeft + input.offsetWidth + h * 0.6);
    s += `<linearGradient id="${id}qv" x1="0" y1="0" x2="0" y2="1">${deepStop(0.12, 0)}${deepStop(0.38)}${deepStop(0.62)}${deepStop(0.88, 0)}</linearGradient>`;
    s += `<linearGradient id="${id}qh" x1="0" y1="0" x2="1" y2="0"><stop offset=".7" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    s += `<mask id="${id}qm"><rect width="${f1(calmEnd)}" height="${h}" fill="url(#${id}qh)"/></mask>`;
    // Small rivers used inside a page get rounded ends; full-width ones run off both edges.
    if (round) s += `<clipPath id="${id}e"><rect width="${w}" height="${h}" rx="${f1(h * 0.42)}"/></clipPath>`;
    s += `</defs><g${round ? ` clip-path="url(#${id}e)"` : ''}>`;
    s += `<path d="${body(-o.shallow)}" class="r-shallow"/><path d="${water}" fill="url(#${id}g)"/>`;

    // Foam: a faint broken line just inside each bank, drifting slowly.
    const foam = [];
    [[o.bank, 1], [h - o.bank, -1]].forEach(([y0, sign]) => {
      foam.push({ period: 40 * k, speed: o.speed[0] * 0.35 });
      s += `<path d="${smooth(edge(y0, sign, o.shallow * 0.4 + h * 0.03))}" class="r-foam" stroke-width="${f1(Math.max(0.8, h * 0.012))}" stroke-dasharray="${[2, 7, 9, 22].map(v => f1(v * k)).join(' ')}"/>`;
    });
    s += '<g class="r-streaks"></g>';
    s += `<rect width="${f1(calmEnd)}" height="${h}" fill="url(#${id}qv)" mask="url(#${id}qm)" class="r-calm"/>`;
    s += '<g class="r-lifelayer"></g></g></svg>';
    el.innerHTML = s;
    st.layer = el.querySelector('.r-lifelayer');

    const streaks = el.querySelector('.r-streaks');
    for (let i = 0; i < o.streaks; i++) {
      const g = document.createElementNS(NS, 'g');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'r-streak');
      g.appendChild(path);
      streaks.appendChild(g);
      stream(g, true, st.gen);
    }
    if (calm) return;

    el.querySelectorAll('.r-foam').forEach((path, i) => {
      const { period, speed } = foam[i];
      track(path.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -period }], { duration: (period / speed) * 1000, iterations: Infinity }));
    });
    spawn(true, st.gen);
    const gen = st.gen;
    const tick = () => {
      if (gen !== st.gen || destroyed) return;
      if (st.seen && !document.hidden && st.live < o.life.max) spawn(false, gen);
      later(tick, between(o.life.gap));
    };
    later(tick, between(o.life.gap));
  }

  // The current speeds up while the field has focus, and everything pauses while the river is off screen.
  const rate = (value) => {
    st.rate = value;
    st.anims.forEach(animation => setRate(animation, (pace.get(animation) || WITH_CURRENT)(value)));
  };
  const onFocusIn = () => rate(2.6);
  const onFocusOut = () => rate(1);
  label.addEventListener('focusin', onFocusIn);
  label.addEventListener('focusout', onFocusOut);

  const visibility = window.IntersectionObserver && new IntersectionObserver((entries) => {
    st.seen = entries[entries.length - 1].isIntersecting;
    st.anims.forEach(animation => (st.seen ? animation.play() : animation.pause()));
  });
  visibility?.observe(label);

  draw();
  const resize = window.ResizeObserver ? new ResizeObserver(() => draw()) : null;
  if (resize) resize.observe(label);
  else window.addEventListener('resize', draw);

  return () => {
    destroyed = true;
    st.gen++;
    st.anims.forEach(animation => animation.cancel());
    st.anims = [];
    timers.forEach(clearTimeout);
    timers.clear();
    visibility?.disconnect();
    if (resize) resize.disconnect();
    else window.removeEventListener('resize', draw);
    label.removeEventListener('focusin', onFocusIn);
    label.removeEventListener('focusout', onFocusOut);
    el.innerHTML = '';
  };
}
