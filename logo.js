(function () {
  const ORBIT_MS = 7200;
  const ASSEMBLE_MS = 2000;
  const ENTER_MS = 2000;
  const TURNS = 1;

  const GLYPH_W = { o: 200, r: 95, b: 122, i: 48, t: 98, a: 125 };
  const GLYPH_H = { o: 209, r: 124, b: 179, i: 179, t: 165, a: 124 };
  const LETTER_H = 150;
  const O_SIZE = 1.5;
  const PATH_RX = 308;
  const PATH_RY = 124;
  const ORBIT_IMG_W = 804;
  const META = {
    o: { w: 526, h: 292, cx: 263.5, cy: 149 },
    r: { w: 316, h: 250, cx: 160.5, cy: 129 },
    b: { w: 262, h: 282, cx: 155, cy: 151.5 },
    i: { w: 240, h: 294, cx: 132, cy: 162.5 },
    t: { w: 184, h: 242, cx: 85, cy: 115.5 },
    a: { w: 172, h: 190, cx: 79.5, cy: 96 },
  };
  const startAngles = {
    r: (182 * Math.PI) / 180,
    b: (125 * Math.PI) / 180,
    i: (58 * Math.PI) / 180,
    t: (-14 * Math.PI) / 180,
    a: (268 * Math.PI) / 180,
  };

  const easeInOut = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  function letterScale(key, unit) {
    const size = key === "o" ? LETTER_H * O_SIZE : LETTER_H;
    return (size * unit) / GLYPH_H[key];
  }

  function ellipsePoint(cx, cy, rx, ry, angle) {
    return {
      x: cx + rx * Math.cos(angle),
      y: cy - ry * Math.sin(angle),
    };
  }

  function rowSlots(L, keys, extraGap, yOffset) {
    const { cx, cy, unit } = L;
    const gap = extraGap * unit;
    const scales = {};
    const widths = {};
    let total = gap * (keys.length - 1);
    for (const key of keys) {
      scales[key] = letterScale(key, unit);
      widths[key] = GLYPH_W[key] * scales[key];
      total += widths[key];
    }
    let x = cx - total / 2;
    const slots = {};
    for (const key of keys) {
      const half = widths[key] / 2;
      x += half;
      slots[key] = { x, y: cy + yOffset * unit, scale: scales[key] };
      x += half + gap;
    }
    return slots;
  }

  function centerSlots(slots, L) {
    let left = Infinity;
    let right = -Infinity;
    for (const [key, slot] of Object.entries(slots)) {
      const scale = slot.scale;
      if (key === "o") {
        left = Math.min(left, slot.x - 179.5 * scale);
        right = Math.max(right, slot.x + 179.5 * scale);
      } else {
        const half = (GLYPH_W[key] * scale) / 2;
        left = Math.min(left, slot.x - half);
        right = Math.max(right, slot.x + half);
      }
    }
    const shift = L.cx - (left + right) / 2;
    for (const slot of Object.values(slots)) slot.x += shift;
    return slots;
  }

  function phase(t, start, duration) {
    if (t <= start) return 0;
    return easeInOut(Math.min(1, (t - start) / duration));
  }

  function mountLogo(root, options = {}) {
    const orbitEl = root.querySelector("[data-orbit]");
    const assets = {};
    for (const key of Object.keys(META)) {
      const el = root.querySelector(`[data-letter="${key}"]`);
      assets[key] = { el, ...META[key] };
    }

    const fitW = options.fitW || 1040;
    const fitH = options.fitH || 560;
    let startedAt = 0;
    let frame = 0;
    let running = false;
    let doneTimer = 0;
    const duration = ORBIT_MS * 0.82 + ASSEMBLE_MS + ENTER_MS;

    function layout() {
      const w = root.clientWidth;
      const h = root.clientHeight;
      const unit = Math.min(w / fitW, h / fitH);
      return { w, h, unit, cx: w * 0.5, cy: h * 0.5 };
    }

    function place(asset, x, y, scale, opacity) {
      asset.el.style.opacity = String(opacity);
      asset.el.style.transform = `translate(${x - asset.cx * scale}px, ${y - asset.cy * scale}px) scale(${scale})`;
    }

    function placeOrbit(el, cx, cy, width, opacity) {
      const height = width * (350 / 804);
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.opacity = String(opacity);
      el.style.transform = `translate(${cx - width / 2}px, ${cy - height / 2}px)`;
    }

    function render(now) {
      if (!running) return;
      const L = layout();
      if (L.w < 2 || L.h < 2) {
        frame = requestAnimationFrame(render);
        return;
      }
      const t = now - startedAt;
      const u = L.unit;
      const rbita = centerSlots(rowSlots(L, ["r", "b", "i", "t", "a"], 22, 18), L);
      const orbita = centerSlots(rowSlots(L, ["o", "r", "b", "i", "t", "a"], 18, 0), L);
      const spin = phase(t, 0, ORBIT_MS);
      const assemble = phase(t, ORBIT_MS * 0.82, ASSEMBLE_MS);
      const enter = phase(t, ORBIT_MS * 0.82 + ASSEMBLE_MS, ENTER_MS);
      const oScale = letterScale("o", u);
      const ox = lerp(L.cx, orbita.o.x, enter);
      const oy = lerp(L.cy, orbita.o.y, enter);
      place(assets.o, ox, oy, oScale, 1);

      const orbitWidth = Math.min(L.w * 0.92, L.h * 1.7);
      const orbitScale = orbitWidth / ORBIT_IMG_W;
      placeOrbit(orbitEl, L.cx, L.cy, orbitWidth, lerp(1, 0, assemble));

      const delta = TURNS * Math.PI * 2 * spin;
      for (const key of ["r", "b", "i", "t", "a"]) {
        const onOrbit = ellipsePoint(
          L.cx,
          L.cy,
          PATH_RX * orbitScale,
          PATH_RY * orbitScale,
          startAngles[key] + delta
        );
        const startScale = letterScale(key, u);
        const mid = rbita[key];
        const fin = orbita[key];
        place(
          assets[key],
          lerp(lerp(onOrbit.x, mid.x, assemble), fin.x, enter),
          lerp(lerp(onOrbit.y, mid.y, assemble), fin.y, enter),
          lerp(lerp(startScale, mid.scale, assemble), fin.scale, enter),
          1
        );
      }
      frame = requestAnimationFrame(render);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frame);
      clearTimeout(doneTimer);
    }

    function start() {
      stop();
      running = true;
      startedAt = performance.now();
      frame = requestAnimationFrame(render);
      if (options.onDone) {
        doneTimer = setTimeout(options.onDone, duration + 900);
      }
    }

    if (options.replayOnClick) {
      root.addEventListener("click", (e) => {
        e.preventDefault();
        start();
      });
    } else {
      root.addEventListener("click", (e) => e.preventDefault());
    }

    return { start, stop };
  }

  const MARKUP = `
    <img data-orbit class="orbit" src="orbit.png" alt="" />
    <img data-letter="o" class="letter letter-o" src="O.png" alt="" />
    <img data-letter="r" class="letter letter-r" src="R.png" alt="" />
    <img data-letter="b" class="letter letter-b" src="B.png" alt="" />
    <img data-letter="i" class="letter letter-i" src="I.png" alt="" />
    <img data-letter="t" class="letter letter-t" src="T.png" alt="" />
    <img data-letter="a" class="letter letter-a" src="A.png" alt="" />
  `;

  window.OrbitaLogo = { mount: mountLogo, markup: MARKUP };

  const introStage = document.getElementById("stage");
  if (introStage) {
    const intro = mountLogo(introStage, {
      onDone: () => {
        if (typeof window.onOrbitaIntroDone === "function") window.onOrbitaIntroDone();
      },
    });
    const replay = document.getElementById("replay");
    if (replay) replay.addEventListener("click", (e) => {
      e.stopPropagation();
      intro.start();
    });
    intro.start();
  }

  window.logoPlayers = {};
  document.querySelectorAll("[data-orbita-logo]").forEach((el) => {
    if (!el.querySelector("[data-letter]")) el.innerHTML = MARKUP;
    const player = mountLogo(el, {
      fitW: Number(el.dataset.fitW) || 520,
      fitH: Number(el.dataset.fitH) || 220,
    });
    window.logoPlayers[el.dataset.orbitaLogo] = player;
    player.start();
  });
})();
