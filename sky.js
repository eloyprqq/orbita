const Sky = (() => {
  const canvas = document.getElementById("sky");
  const ctx = canvas.getContext("2d");
  const loc = { lat: 0, lon: 0, bortle: 9, located: false };
  const state = {
    az: 0,
    alt: 18 * Math.PI / 180,
    fov: 90,
    flags: {
      constellations: true,
      art: false,
      atmosphere: true,
      landscape: true,
      azGrid: false,
      eqGrid: false,
      dso: true,
      night: false,
    },
  };
  let simOffset = 0;
  let timeScale = 1;
  let lastTick = performance.now();
  let slew = null;
  let selected = null;
  let guide = null;
  let dragging = false;
  let velAz = 0;
  let velAlt = 0;
  const frame = { lst: 0, sinLat: 0, cosLat: 1, fl: 400, w: 1, h: 1, limit: 5 };

  const starIndex = new Map();
  const catalogStars = [];
  const fieldStars = [];
  const milky = [];

  function rand(seed) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function bvColor(bv) {
    const t = (Math.max(-0.3, Math.min(1.7, bv)) + 0.3) / 2;
    const r = Math.round(180 + t * 75);
    const g = Math.round(210 - t * 70);
    const b = Math.round(255 - t * 140);
    return `rgb(${r},${g},${b})`;
  }

  function buildCatalog() {
    (window.CATALOG?.stars || []).forEach((row) => {
      const [name, ra, dec, mag, bv] = row;
      const decR = dec * Math.PI / 180;
      const star = {
        name,
        ra,
        dec,
        mag,
        color: bvColor(bv ?? 0.3),
        named: mag < 2.4,
        sinDec: Math.sin(decR),
        cosDec: Math.cos(decR),
      };
      catalogStars.push(star);
      starIndex.set(name.toLowerCase(), star);
    });
    const r = rand(7);
    for (let i = 0; i < 2600; i += 1) {
      const mag = 3.2 + Math.pow(r(), 0.55) * 3.4;
      const dec = Math.asin(r() * 2 - 1) * 180 / Math.PI;
      const decR = dec * Math.PI / 180;
      fieldStars.push({
        ra: r() * 24,
        dec,
        mag,
        color: bvColor(r() * 1.4 - 0.2),
        sinDec: Math.sin(decR),
        cosDec: Math.cos(decR),
      });
    }
    for (let i = 0; i < 1400; i += 1) {
      const l = r() * Math.PI * 2;
      const b = (r() - 0.5) * 0.16;
      const raDec = galToEq(l, b);
      const decR = raDec.dec * Math.PI / 180;
      milky.push({
        ra: raDec.ra,
        dec: raDec.dec,
        glow: 1.2 + r() * 2.4,
        a: 0.018 + r() * 0.04,
        sinDec: Math.sin(decR),
        cosDec: Math.cos(decR),
      });
    }
  }

  function galToEq(l, b) {
    const aG = 192.85948 * Math.PI / 180;
    const dG = 27.12825 * Math.PI / 180;
    const lN = 122.93192 * Math.PI / 180;
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    const cl = Math.cos(lN - l);
    const sl = Math.sin(lN - l);
    const dec = Math.asin(sb * Math.sin(dG) + cb * Math.cos(dG) * cl);
    const ra = aG + Math.atan2(cb * sl, sb * Math.cos(dG) - cb * Math.sin(dG) * cl);
    return { ra: ((ra * 12 / Math.PI) + 24) % 24, dec: dec * 180 / Math.PI };
  }

  function now() {
    return new Date(Date.now() + simOffset);
  }

  function lstHours(date) {
    const jd = date / 86400000 + 2440587.5;
    const t = (jd - 2451545.0) / 36525;
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t;
    gmst = ((gmst % 360) + 360) % 360;
    return ((gmst + loc.lon * 180 / Math.PI) / 15 + 24) % 24;
  }

  function syncFrame(date, w, h, basis) {
    frame.lst = lstHours(date);
    frame.sinLat = Math.sin(loc.lat);
    frame.cosLat = Math.cos(loc.lat);
    frame.w = w;
    frame.h = h;
    frame.fl = (0.5 * Math.min(w, h)) / Math.tan((state.fov * Math.PI / 180) / 2);
    frame.basis = basis;
    frame.limit = magLimit();
  }

  function raDecToAltAz(raH, decD, date, sinDec, cosDec) {
    const lst = date ? lstHours(date) : frame.lst;
    const ha = (lst - raH) * 15 * Math.PI / 180;
    const sd = sinDec ?? Math.sin(decD * Math.PI / 180);
    const cd = cosDec ?? Math.cos(decD * Math.PI / 180);
    const sinHa = Math.sin(ha);
    const cosHa = Math.cos(ha);
    const sinAlt = sd * frame.sinLat + cd * frame.cosLat * cosHa;
    const alt = Math.asin(Math.min(1, Math.max(-1, sinAlt)));
    const az = Math.atan2(
      -cd * sinHa,
      sd * frame.cosLat - cd * frame.sinLat * cosHa
    );
    return { alt, az };
  }

  function starDir(star) {
    const ha = (frame.lst - star.ra) * 15 * Math.PI / 180;
    const sinHa = Math.sin(ha);
    const cosHa = Math.cos(ha);
    const y = star.sinDec * frame.sinLat + star.cosDec * frame.cosLat * cosHa;
    if (y < -0.12) return null;
    return {
      x: -star.cosDec * sinHa,
      y,
      z: star.sinDec * frame.cosLat - star.cosDec * frame.sinLat * cosHa,
    };
  }

  function projectDir(d) {
    const z = dot(d, frame.basis.f);
    if (z < 0.04) return null;
    return {
      x: frame.w * 0.5 + (dot(d, frame.basis.r) * frame.fl) / z,
      y: frame.h * 0.5 - (dot(d, frame.basis.u) * frame.fl) / z,
      z,
      alt: Math.asin(Math.min(1, Math.max(-1, d.y))),
    };
  }

  function altAzDir(alt, az) {
    const c = Math.cos(alt);
    return { x: c * Math.sin(az), y: Math.sin(alt), z: c * Math.cos(az) };
  }

  function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  }
  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  function mag3(a) {
    return Math.hypot(a.x, a.y, a.z);
  }
  function norm(a) {
    const m = mag3(a) || 1;
    return { x: a.x / m, y: a.y / m, z: a.z / m };
  }

  function cameraBasis() {
    const f = altAzDir(state.alt, state.az);
    const east = altAzDir(0, state.az + Math.PI / 2);
    const r = norm({
      x: east.x - f.x * dot(east, f),
      y: east.y - f.y * dot(east, f),
      z: east.z - f.z * dot(east, f),
    });
    const u = cross(f, r);
    return { f, r, u };
  }

  function focalPx() {
    return (0.5 * Math.min(innerWidth, innerHeight)) / Math.tan((state.fov * Math.PI / 180) / 2);
  }

  function projectAltAz(alt, az, w, h, basis) {
    const d = altAzDir(alt, az);
    const z = dot(d, basis.f);
    if (z < 0.04) return null;
    const x = dot(d, basis.r);
    const y = dot(d, basis.u);
    const fl = (0.5 * Math.min(w, h)) / Math.tan((state.fov * Math.PI / 180) / 2);
    return {
      x: w * 0.5 + (x * fl) / z,
      y: h * 0.5 - (y * fl) / z,
      z,
      alt,
      az,
    };
  }

  function projectStar(star) {
    const d = starDir(star);
    if (!d) return null;
    return projectDir(d);
  }

  function projectRaDec(ra, dec) {
    const decR = dec * Math.PI / 180;
    return projectStar({ ra, sinDec: Math.sin(decR), cosDec: Math.cos(decR) });
  }

  function daysJ2000(date) {
    return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  }

  function eclToEq(lon, date) {
    const n = daysJ2000(date);
    const eps = (23.4393 - 0.0000004 * n) * Math.PI / 180;
    const x = Math.cos(lon);
    const y = Math.sin(lon);
    const ra = Math.atan2(y * Math.cos(eps), x);
    const dec = Math.asin(y * Math.sin(eps));
    return { ra: ((ra * 12 / Math.PI) + 24) % 24, dec: dec * 180 / Math.PI };
  }

  function planets(date) {
    const lat = (loc.lat * 180) / Math.PI;
    const lon = (loc.lon * 180) / Math.PI;
    if (loc.located && typeof OrbitaEphemeris !== "undefined") {
      const exact = OrbitaEphemeris.bodies(date, lat, lon);
      if (exact) return exact;
    }
    const n = daysJ2000(date);
    const sun = (280.46 + 0.9856474 * n) * Math.PI / 180;
    const moon = (218.316 + 13.176396 * n) * Math.PI / 180;
    const venus = (181.979 + 1.60213 * n) * Math.PI / 180;
    const mars = (355.433 + 0.524033 * n) * Math.PI / 180;
    const jup = (34.351 + 0.083091 * n) * Math.PI / 180;
    const sat = (50.077 + 0.033461 * n) * Math.PI / 180;
    return [
      { name: "Sun", ...eclToEq(sun, date), mag: -26, kind: "sun", source: "mean-longitude" },
      { name: "Moon", ...eclToEq(moon, date), mag: -10, kind: "moon", source: "mean-longitude" },
      { name: "Venus", ...eclToEq(venus, date), mag: -4.0, kind: "planet", source: "mean-longitude" },
      { name: "Mars", ...eclToEq(mars, date), mag: 0.8, kind: "planet", source: "mean-longitude" },
      { name: "Jupiter", ...eclToEq(jup, date), mag: -2.2, kind: "planet", source: "mean-longitude" },
      { name: "Saturn", ...eclToEq(sat, date), mag: 0.6, kind: "planet", source: "mean-longitude" },
    ];
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function horizonAnchor(w, h, basis) {
    return projectAltAz(0, state.az, w, h, basis);
  }

  function drawSky(w, h, basis) {
    ctx.fillStyle = loc.located ? "#02040c" : "#0b0912";
    ctx.fillRect(0, 0, w, h);
    if (!loc.located) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#07060d");
      g.addColorStop(1, "#1c1822");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    if (!state.flags.atmosphere) return;
    const hy = horizonAnchor(w, h, basis);
    if (!hy || hy.y < 40) return;
    const glow = 0.22 + loc.bortle * 0.035;
    const g = ctx.createLinearGradient(0, hy.y - h * 0.45, 0, hy.y + 30);
    g.addColorStop(0, "rgba(2,4,12,0)");
    g.addColorStop(0.55, `rgba(80,90,108,${0.1 + loc.bortle * 0.018})`);
    g.addColorStop(1, `rgba(198,204,214,${glow})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawHorizonGlow() {}

  function drawMilky(date, w, h, basis) {
    if (!loc.located) return;
    const fade = Math.max(0, 1 - (loc.bortle - 2.2) / 5.6);
    if (fade < 0.04) return;
    milky.forEach((p) => {
      const s = projectStar(p);
      if (!s) return;
      const rad = p.glow * (90 / state.fov);
      ctx.fillStyle = `rgba(190,200,220,${p.a * fade})`;
      ctx.fillRect(s.x - rad, s.y - rad, rad * 2, rad * 2);
    });
  }

  function magLimit() {
    if (!loc.located) return 4.1;
    return 7.6 - loc.bortle * 0.38;
  }

  const STAR_KO = {
    sirius: "시리우스",
    vega: "베가",
    capella: "카펠라",
    rigel: "리겔",
    procyon: "프로키온",
    betelgeuse: "베텔게우스",
    altair: "알타이르",
    aldebaran: "알데바란",
    antares: "안타레스",
    spica: "스피카",
    pollux: "폴룩스",
    deneb: "데네브",
    regulus: "레굴루스",
    polaris: "북극성",
    arcturus: "아크투루스",
    castor: "카스토르",
    sun: "태양",
    moon: "달",
    venus: "금성",
    mars: "화성",
    jupiter: "목성",
    saturn: "토성",
    "andromeda galaxy": "안드로메다은하",
    "orion nebula": "오리온 성운",
    pleiades: "플레이아데스",
    beehive: "벌집 성단",
    whirlpool: "소용돌이 은하",
    sombrero: "솜브레로 은하",
    lagoon: "석호 성운",
    "omega centauri": "오메가 센타우리",
    hyades: "히아데스",
  };

  function skyLabel(name, ko) {
    const basic = document.documentElement.dataset.mode !== "expert";
    if (!basic) return name;
    return ko || STAR_KO[String(name).toLowerCase()] || name;
  }

  function drawStar(p, star) {
    const limit = frame.limit;
    if (star.mag > limit) return;
    const size = Math.max(0.35, 2.7 - star.mag * 0.38) * (88 / state.fov);
    const alpha = Math.max(0.12, 1 - star.mag / (limit + 0.4));
    if (star.mag < 1.3) {
      ctx.strokeStyle = star.color;
      ctx.globalAlpha = alpha * 0.35;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(p.x - size * 7, p.y);
      ctx.lineTo(p.x + size * 7, p.y);
      ctx.moveTo(p.x, p.y - size * 7);
      ctx.lineTo(p.x, p.y + size * 7);
      ctx.stroke();
    }
    ctx.fillStyle = star.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    if (star.named && star.mag < 1.7 && state.fov < 100) {
      ctx.globalAlpha = 0.85;
      ctx.font = "12px Segoe UI, sans-serif";
      ctx.fillText(skyLabel(star.name), p.x + 7, p.y - 6);
    }
    ctx.globalAlpha = 1;
  }

  function drawConstellations(date, w, h, basis) {
    if (!loc.located || !state.flags.constellations) return;
    const lines = window.CATALOG?.constellations || [];
    ctx.lineWidth = 1.05;
    ctx.strokeStyle = "rgba(130,170,230,0.42)";
    lines.forEach((c) => {
      const pts = [];
      c.lines.forEach(([a, b]) => {
        const sa = starIndex.get(a.toLowerCase());
        const sb = starIndex.get(b.toLowerCase());
        if (!sa || !sb) return;
        const pa = projectStar(sa);
        const pb = projectStar(sb);
        if (!pa || !pb) return;
        pts.push(pa, pb);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      });
      if (state.flags.art && pts.length > 2) {
        ctx.fillStyle = "rgba(140,170,230,0.06)";
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.fill();
      }
      const first = starIndex.get(c.lines[0][0].toLowerCase());
      if (!first) return;
      const lab = projectStar(first);
      if (lab && lab.y > 70 && lab.y < h * 0.7 && state.fov < 110) {
        ctx.fillStyle = "rgba(170,195,230,0.75)";
        ctx.font = "13px Segoe UI, sans-serif";
        ctx.fillText(skyLabel(c.name, c.ko), lab.x + 10, lab.y - 10);
      }
    });
  }

  function drawDso(date, w, h, basis) {
    if (!loc.located || !state.flags.dso) return;
    (window.CATALOG?.dso || []).forEach((d) => {
      const p = projectRaDec(d.ra, d.dec);
      if (!p) return;
      const rad = d.r * (90 / state.fov);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
      g.addColorStop(0, d.tint);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();
      if (state.fov < 55) {
        ctx.fillStyle = "rgba(200,210,230,0.7)";
        ctx.font = "11px Segoe UI, sans-serif";
        ctx.fillText(skyLabel(d.name), p.x + 8, p.y + 4);
      }
    });
  }

  function drawPlanets(date, w, h, basis) {
    if (!loc.located) return;
    planets(date).forEach((pl) => {
      const p = projectRaDec(pl.ra, pl.dec);
      if (!p) return;
      if (pl.kind === "moon") {
        ctx.fillStyle = "#e8e4d4";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11 * (70 / state.fov), 0, Math.PI * 2);
        ctx.fill();
      } else if (pl.kind === "sun") {
        const rad = 16 * (70 / state.fov);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 2);
        g.addColorStop(0, "rgba(255,244,200,1)");
        g.addColorStop(0.4, "rgba(255,210,120,0.7)");
        g.addColorStop(1, "rgba(255,180,80,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad * 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = pl.name === "Mars" ? "#ff8a62" : "#f3f0e4";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2.2, 3.2 - pl.mag * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(235,240,250,0.9)";
      ctx.font = "13px Segoe UI, sans-serif";
      ctx.fillText(skyLabel(pl.name), p.x + 10, p.y - 8);
    });
  }

  function drawCardinals(w, h, basis) {
    if (!loc.located) return;
    const marks = [
      [0, "N", true],
      [Math.PI / 4, "NE", false],
      [Math.PI / 2, "E", true],
      [(3 * Math.PI) / 4, "SE", false],
      [Math.PI, "S", true],
      [(5 * Math.PI) / 4, "SW", false],
      [-Math.PI / 2, "W", true],
      [(-Math.PI) / 4, "NW", false],
    ];
    marks.forEach(([az, label, major]) => {
      const p = projectAltAz(0.02, az, w, h, basis);
      if (!p) return;
      ctx.fillStyle = major ? "#c37a7a" : "rgba(195,122,122,0.7)";
      ctx.beginPath();
      ctx.arc(p.x, p.y - (major ? 16 : 12), major ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = major ? "700 18px Times New Roman, serif" : "600 12px Segoe UI, sans-serif";
      ctx.fillText(label, p.x - (major ? 6 : 8), p.y);
    });
  }

  function drawAzTape() {
    const tape = document.getElementById("az-tape");
    const readout = document.getElementById("az-readout");
    if (!tape) return;
    const w = Math.max(1, tape.clientWidth);
    const h = Math.max(1, tape.clientHeight);
    if (tape.width !== w || tape.height !== h) {
      tape.width = w;
      tape.height = h;
    }
    const t = tape.getContext("2d");
    t.clearRect(0, 0, w, h);
    const heading = headingDeg();
    if (readout) readout.textContent = `${headingName(heading)} ${heading.toFixed(0)}°`;
    const ppm = w / 150;
    const labels = [
      [0, "N"],
      [45, "NE"],
      [90, "E"],
      [135, "SE"],
      [180, "S"],
      [225, "SW"],
      [270, "W"],
      [315, "NW"],
    ];
    t.strokeStyle = "rgba(230,235,245,0.18)";
    t.fillStyle = "rgba(230,235,245,0.72)";
    t.font = "11px Segoe UI, sans-serif";
    t.textAlign = "center";
    for (let d = 0; d < 360; d += 5) {
      let delta = d - heading;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      const x = w / 2 + delta * ppm;
      if (x < -20 || x > w + 20) continue;
      const major = d % 45 === 0;
      t.beginPath();
      t.moveTo(x, major ? 4 : 10);
      t.lineTo(x, h - 4);
      t.stroke();
    }
    t.font = "700 12px Segoe UI, sans-serif";
    labels.forEach(([d, name]) => {
      let delta = d - heading;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      const x = w / 2 + delta * ppm;
      if (x < 12 || x > w - 12) return;
      t.fillStyle = name === "N" ? "#e08a8a" : "#e8edf8";
      t.fillText(name, x, 14);
    });
  }

  function drawGrids(date, w, h, basis) {
    ctx.lineWidth = 1;
    if (state.flags.azGrid && loc.located) {
      ctx.strokeStyle = "rgba(210,210,220,0.18)";
      for (let az = 0; az < 360; az += 30) {
        ctx.beginPath();
        let pen = false;
        for (let alt = 0; alt <= 90; alt += 4) {
          const p = projectAltAz(alt * Math.PI / 180, az * Math.PI / 180, w, h, basis);
          if (!p) {
            pen = false;
            continue;
          }
          if (!pen) {
            ctx.moveTo(p.x, p.y);
            pen = true;
          } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }
    if (state.flags.eqGrid && loc.located) {
      ctx.strokeStyle = "rgba(80,170,220,0.2)";
      for (let ra = 0; ra < 24; ra += 2) {
        ctx.beginPath();
        let pen = false;
        for (let dec = -80; dec <= 80; dec += 5) {
          const p = projectRaDec(ra, dec);
          if (!p) {
            pen = false;
            continue;
          }
          if (!pen) {
            ctx.moveTo(p.x, p.y);
            pen = true;
          } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }
  }

  function drawLandscape(w, h, basis) {
    const nEl = document.getElementById("horizon-n");
    if (nEl) nEl.hidden = true;
    if (!state.flags.landscape) return;
    const pts = [];
    const span = Math.max(80, state.fov * 0.85);
    for (let deg = -span; deg <= span; deg += 2) {
      const p = projectAltAz(0, state.az + (deg * Math.PI) / 180, w, h, basis);
      if (!p) continue;
      pts.push({ x: p.x, y: p.y + Math.sin((deg + 18) * 0.13) * 14 + Math.sin((deg + 7) * 0.31) * 6 });
    }
    if (pts.length < 4 || pts.every((p) => p.y > h - 4)) return;
    ctx.fillStyle = "#080a0f";
    ctx.beginPath();
    ctx.moveTo(0, h + 80);
    ctx.lineTo(0, pts[0].y);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(w, pts[pts.length - 1].y);
    ctx.lineTo(w, h + 80);
    ctx.closePath();
    ctx.fill();
  }

  function stepTime() {
    const t = performance.now();
    const dt = (t - lastTick) / 1000;
    lastTick = t;
    if (timeScale !== 1) simOffset += dt * 1000 * (timeScale - 1);
    if (!dragging && !slew) {
      const damp = Math.exp(-dt * 6.5);
      state.az = wrapAzRad(state.az + velAz * dt);
      state.alt = Math.max(-0.08, Math.min(1.54, state.alt + velAlt * dt));
      velAz *= damp;
      velAlt *= damp;
      if (Math.abs(velAz) < 0.02) velAz = 0;
      if (Math.abs(velAlt) < 0.02) velAlt = 0;
    }
    if (slew) {
      const k = Math.min(1, dt * 2.4);
      let daz = slew.az - state.az;
      while (daz > Math.PI) daz -= Math.PI * 2;
      while (daz < -Math.PI) daz += Math.PI * 2;
      state.az = wrapAzRad(state.az + daz * k);
      state.alt += (slew.alt - state.alt) * k;
      if (Math.abs(daz) < 0.004 && Math.abs(slew.alt - state.alt) < 0.004) slew = null;
    }
  }

  function render() {
    stepTime();
    const w = innerWidth;
    const h = innerHeight;
    const date = now();
    const basis = cameraBasis();
    syncFrame(date, w, h, basis);
    drawSky(w, h, basis);
    drawMilky(date, w, h, basis);
    drawHorizonGlow();
    drawGrids(date, w, h, basis);
    drawConstellations(date, w, h, basis);
    drawDso(date, w, h, basis);
    fieldStars.forEach((s) => {
      const p = projectStar(s);
      if (p) drawStar(p, s);
    });
    catalogStars.forEach((s) => {
      const p = projectStar(s);
      if (p) drawStar(p, s);
    });
    drawPlanets(date, w, h, basis);
    drawLandscape(w, h, basis);
    drawCardinals(w, h, basis);
    drawAzTape();
    if (selected) {
      const p = selected.sinDec != null ? projectStar(selected) : projectRaDec(selected.ra, selected.dec);
      if (p) {
        ctx.strokeStyle = "rgba(255,220,140,0.9)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    drawGuide();
  }

  function drawGuide() {
    if (!guide || !loc.located || !guide.steps || !guide.steps.length) return;
    const pts = guide.steps.map((step) => {
      const p = projectRaDec(step.ra, step.dec);
      return p ? { ...step, p } : null;
    });
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(255, 196, 92, 0.9)";
    ctx.beginPath();
    let pen = false;
    pts.forEach((node) => {
      if (!node) {
        pen = false;
        return;
      }
      if (!pen) {
        ctx.moveTo(node.p.x, node.p.y);
        pen = true;
      } else ctx.lineTo(node.p.x, node.p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach((node, i) => {
      if (!node) return;
      const current = i === guide.index;
      const target = i === pts.length - 1;
      ctx.beginPath();
      ctx.arc(node.p.x, node.p.y, current ? 16 : 8, 0, Math.PI * 2);
      ctx.lineWidth = current ? 2.4 : 1.2;
      ctx.strokeStyle = target ? "rgba(150, 214, 255, 0.95)" : "rgba(255, 210, 120, 0.95)";
      ctx.stroke();
      if (current || target) {
        ctx.fillStyle = "rgba(255, 244, 220, 0.95)";
        ctx.font = "12px Segoe UI, sans-serif";
        ctx.fillText(`${i + 1}. ${node.name}`, node.p.x + 12, node.p.y - 10);
      }
    });
    ctx.restore();
  }

  function loop() {
    render();
    requestAnimationFrame(loop);
  }

  function bind() {
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let lastPtrT = 0;
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      moved = false;
      velAz = 0;
      velAlt = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      lastPtrT = performance.now();
      canvas.classList.add("dragging");
      slew = null;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener(
      "pointermove",
      (e) => {
        if (!dragging) return;
        e.preventDefault();
        const parts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        let dx = 0;
        let dy = 0;
        parts.forEach((ev) => {
          dx += ev.clientX - lastX;
          dy += ev.clientY - lastY;
          lastX = ev.clientX;
          lastY = ev.clientY;
        });
        const t = performance.now();
        const dt = Math.max(0.001, Math.min(0.05, (t - lastPtrT) / 1000));
        lastPtrT = t;
        if (Math.hypot(dx, dy) > 2) moved = true;
        const fl = focalPx();
        const daz = -dx / fl;
        const dalt = dy / fl;
        state.az = wrapAzRad(state.az + daz);
        state.alt = Math.max(-0.08, Math.min(1.54, state.alt + dalt));
        velAz = daz / dt;
        velAlt = dalt / dt;
      },
      { passive: false }
    );
    const end = (e) => {
      canvas.classList.remove("dragging");
      if (dragging && !moved) pick(e.clientX, e.clientY);
      dragging = false;
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    window.addEventListener("keydown", (e) => {
      if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      const step = (12 * Math.PI) / 180;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        state.az = wrapAzRad(state.az - step);
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        state.az = wrapAzRad(state.az + step);
        e.preventDefault();
      } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        state.alt = Math.min(1.54, state.alt + step * 0.6);
        e.preventDefault();
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        state.alt = Math.max(-0.08, state.alt - step * 0.6);
        e.preventDefault();
      }
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        state.fov = Math.max(18, Math.min(160, state.fov + e.deltaY * 0.035));
        const fovEl = document.getElementById("fov");
        if (fovEl) fovEl.textContent = `FOV ${state.fov.toFixed(1)}°`;
      },
      { passive: false }
    );
  }

  function pick(x, y) {
    if (!loc.located) return null;
    const date = now();
    const basis = cameraBasis();
    syncFrame(date, innerWidth, innerHeight, basis);
    let best = null;
    let bestD = 22;
    catalogStars.concat(planets(date)).forEach((s) => {
      const p = s.sinDec != null ? projectStar(s) : projectRaDec(s.ra, s.dec);
      if (!p) return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = { ...s, alt: p.alt, az: p.az };
      }
    });
    selected = best;
    const hud = document.getElementById("obj-label");
    if (hud) {
      if (!best) hud.hidden = true;
      else {
        hud.hidden = false;
        hud.textContent = best.name;
      }
    }
    const info = document.getElementById("pick-info");
    if (info && best) {
      info.hidden = false;
      document.getElementById("pick-name").textContent = best.name;
      document.getElementById("pick-meta").textContent =
        `등급 ${best.mag?.toFixed?.(1) ?? "—"} · 고도 ${(best.alt * 180 / Math.PI).toFixed(1)}°`;
    }
    return best;
  }

  function search(query, options = {}) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const slew = options.slew !== false;
    const hit =
      starIndex.get(q) ||
      catalogStars.find((s) => s.name.toLowerCase().startsWith(q)) ||
      (window.CATALOG.constellations || []).find(
        (c) => c.name.toLowerCase().includes(q) || (c.ko && c.ko.includes(query.trim()))
      );
    if (!hit) return null;
    if (hit.lines) {
      const s = starIndex.get(hit.lines[0][0].toLowerCase());
      if (!s) return null;
      if (slew) slewTo(s.ra, s.dec);
      return { name: hit.ko || hit.name, ra: s.ra, dec: s.dec, kind: "constellation" };
    }
    if (slew) slewTo(hit.ra, hit.dec);
    selected = hit;
    return hit;
  }

  function directionOf(ra, dec) {
    const decR = (dec * Math.PI) / 180;
    const ha = (frame.lst - ra) * 15 * Math.PI / 180;
    const sinDec = Math.sin(decR);
    const cosDec = Math.cos(decR);
    const sinHa = Math.sin(ha);
    const cosHa = Math.cos(ha);
    return {
      x: -cosDec * sinHa,
      y: sinDec * frame.sinLat + cosDec * frame.cosLat * cosHa,
      z: sinDec * frame.cosLat - cosDec * frame.sinLat * cosHa,
    };
  }

  function screenAim(ra, dec) {
    const basis = cameraBasis();
    syncFrame(now(), innerWidth, innerHeight, basis);
    const d = directionOf(ra, dec);
    const right = dot(d, basis.r);
    const up = dot(d, basis.u);
    const forward = dot(d, basis.f);
    const w = innerWidth;
    const h = innerHeight;
    let x = null;
    let y = null;
    if (forward > 0.04) {
      x = w * 0.5 + (right * frame.fl) / forward;
      y = h * 0.5 - (up * frame.fl) / forward;
    }
    const onScreen = x != null && x >= 0 && x <= w && y >= 0 && y <= h;
    return { x, y, right, up, forward, onScreen, w, h, below: d.y < -0.02 };
  }

  function slewTo(ra, dec) {
    const { alt, az } = raDecToAltAz(ra, dec, now());
    slew = { alt: Math.max(0.05, alt), az };
  }

  function visibleRanking() {
    const date = now();
    return (window.CATALOG?.constellations || [])
      .map((c) => {
        const s = starIndex.get(c.lines[0][0].toLowerCase());
        if (!s) return null;
        const p = raDecToAltAz(s.ra, s.dec, date);
        return { name: c.name, ko: c.ko, alt: p.alt };
      })
      .filter((c) => c && c.alt > 0.08)
      .sort((a, b) => b.alt - a.alt)
      .slice(0, 8);
  }

  function setFlag(name, on) {
    state.flags[name] = on;
    canvas.classList.toggle("night", state.flags.night);
  }
  function wrapAzRad(az) {
    while (az > Math.PI) az -= Math.PI * 2;
    while (az < -Math.PI) az += Math.PI * 2;
    return az;
  }

  function headingDeg() {
    return ((state.az * 180 / Math.PI) % 360 + 360) % 360;
  }

  function headingName(deg) {
    const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return names[Math.round(deg / 45) % 8];
  }

  function lookAz(deg, altRad) {
    slew = {
      az: wrapAzRad((deg * Math.PI) / 180),
      alt: typeof altRad === "number" ? altRad : Math.max(0.12, state.alt),
    };
  }

  function applyLook(az, alt) {
    if (dragging) return;
    slew = null;
    velAz = 0;
    velAlt = 0;
    state.az = wrapAzRad(az);
    state.alt = Math.max(-0.4, Math.min(Math.PI / 2 - 0.03, alt));
  }

  function setLocation(latDeg, lonDeg, bortle, opts = {}) {
    loc.lat = latDeg * Math.PI / 180;
    loc.lon = lonDeg * Math.PI / 180;
    loc.located = true;
    frame.sinLat = Math.sin(loc.lat);
    frame.cosLat = Math.cos(loc.lat);
    if (typeof bortle === "number") loc.bortle = bortle;
    if (opts.resetView) {
      state.az = 0;
      state.alt = 0.22;
    }
  }
  function clearLocation() {
    loc.located = false;
    loc.bortle = 9;
  }

  buildCatalog();
  resize();
  bind();
  window.addEventListener("resize", resize);
  loop();

  function altAzAt(ra, dec, date) {
    const decR = (dec * Math.PI) / 180;
    const p = raDecToAltAz(ra, dec, date, Math.sin(decR), Math.cos(decR));
    let az = (p.az * 180) / Math.PI;
    if (az < 0) az += 360;
    return { alt: (p.alt * 180) / Math.PI, az };
  }

  return {
    setFlag,
    setLocation,
    clearLocation,
    isLocated: () => loc.located,
    getBortle: () => loc.bortle,
    getPlace: () => ({
      lat: (loc.lat * 180) / Math.PI,
      lon: (loc.lon * 180) / Math.PI,
      bortle: loc.bortle,
      located: loc.located,
    }),
    magLimit,
    visibleRanking,
    search,
    pick,
    lookAz,
    applyLook,
    isDragging: () => dragging,
    headingDeg,
    altAzAt,
    bodiesAt: planets,
    slewToRaDec: slewTo,
    screenAim,
    getSelected: () => selected,
    getGuide: () => guide,
    setGuide: (next) => {
      guide = next;
    },
    now,
    setTimeScale: (s) => {
      timeScale = s;
    },
    getTimeScale: () => timeScale,
    shiftHours: (h) => {
      simOffset += h * 3600000;
    },
    resetTime: () => {
      simOffset = 0;
      timeScale = 1;
    },
    state,
  };
})();
