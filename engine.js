/* Orbita intelligence engine.
   Planet, Moon, and Sun positions come from Sky.bodiesAt (Astronomy Engine when loaded).
   Scores are a recommendation index, not a measured success probability.
   Bortle remains the place-type estimate from app.js. */
const OrbitaEngine = (() => {
  const KO = {
    Sun: "태양",
    Moon: "달",
    Venus: "금성",
    Mars: "화성",
    Jupiter: "목성",
    Saturn: "토성",
    "Andromeda Galaxy": "안드로메다은하",
    "Orion Nebula": "오리온 성운",
    Pleiades: "플레이아데스",
    Beehive: "벌집 성단",
    Whirlpool: "소용돌이 은하",
    Sombrero: "솜브레로 은하",
    Lagoon: "석호 성운",
    "Omega Centauri": "오메가 센타우리",
    Hyades: "히아데스",
  };

  const DSO_MAG = {
    "Andromeda Galaxy": 3.4,
    "Orion Nebula": 4.0,
    Pleiades: 1.6,
    Beehive: 3.7,
    Whirlpool: 8.4,
    Sombrero: 8.0,
    Lagoon: 6.0,
    "Omega Centauri": 3.9,
    Hyades: 0.5,
  };

  function label(target) {
    const ko = KO[target.name];
    return ko ? `${ko}` : target.name;
  }

  function fullLabel(target) {
    const ko = KO[target.name];
    if (!ko || ko === target.name) return target.name;
    return `${ko} · ${target.name}`;
  }

  function angularSep(ra1, dec1, ra2, dec2) {
    const d1 = (dec1 * Math.PI) / 180;
    const d2 = (dec2 * Math.PI) / 180;
    const dra = ((ra1 - ra2) * 15 * Math.PI) / 180;
    const cos = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dra);
    return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  }

  function uniqueStars() {
    const seen = new Set();
    const out = [];
    (window.CATALOG?.stars || []).forEach((row) => {
      const [name, ra, dec, mag] = row;
      const key = `${Number(ra).toFixed(2)}|${Number(dec).toFixed(2)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        id: `star:${name}`,
        name,
        kind: "star",
        ra,
        dec,
        mag,
        moving: false,
        magNote: "catalog",
      });
    });
    return out;
  }

  function catalogTargets() {
    const stars = uniqueStars().filter((s) => s.mag <= 2.05);
    const planets = Sky.bodiesAt(new Date())
      .filter((b) => b.name !== "Sun")
      .map((b) => ({
        id: `${b.kind === "moon" ? "moon" : "planet"}:${b.name}`,
        name: b.name,
        kind: b.kind === "moon" ? "moon" : "planet",
        ra: b.ra,
        dec: b.dec,
        mag: b.mag,
        moving: true,
        magNote: "constant",
      }));
    const dsos = (window.CATALOG?.dso || []).map((d) => ({
      id: `dso:${d.name}`,
      name: d.name,
      kind: "dso",
      ra: d.ra,
      dec: d.dec,
      mag: DSO_MAG[d.name] ?? 8,
      moving: false,
      magNote: "representative",
    }));
    return stars.concat(planets, dsos);
  }

  function find(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const stars = uniqueStars()
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 6);
    const dsos = (window.CATALOG?.dso || [])
      .filter((d) => d.name.toLowerCase().includes(q) || (KO[d.name] || "").includes(query.trim()))
      .map((d) => ({
        id: `dso:${d.name}`,
        name: d.name,
        kind: "dso",
        ra: d.ra,
        dec: d.dec,
        mag: DSO_MAG[d.name] ?? 8,
        moving: false,
        magNote: "representative",
      }));
    const planets = Sky.bodiesAt(new Date())
      .filter((b) => b.name !== "Sun")
      .filter((b) => b.name.toLowerCase().includes(q) || (KO[b.name] || "").includes(query.trim()))
      .map((b) => ({
        id: `${b.kind === "moon" ? "moon" : "planet"}:${b.name}`,
        name: b.name,
        kind: b.kind === "moon" ? "moon" : "planet",
        ra: b.ra,
        dec: b.dec,
        mag: b.mag,
        moving: true,
        magNote: "constant",
      }));
    return stars.concat(planets, dsos).slice(0, 8);
  }

  function targetById(id) {
    return catalogTargets().concat(uniqueStars()).find((t) => t.id === id) || null;
  }

  function nightOf(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const start = new Date(y, m - 1, d, 18, 0, 0, 0);
    const end = new Date(y, m - 1, d + 1, 6, 0, 0, 0);
    return { start, end };
  }

  function skyState(date) {
    const bodies = Sky.bodiesAt(date);
    const moon = bodies.find((b) => b.name === "Moon");
    const sun = bodies.find((b) => b.name === "Sun");
    const moonAlt = Sky.altAzAt(moon.ra, moon.dec, date).alt;
    const sunAlt = Sky.altAzAt(sun.ra, sun.dec, date).alt;
    const elong = angularSep(moon.ra, moon.dec, sun.ra, sun.dec);
    const illum = Number.isFinite(moon.illum)
      ? moon.illum
      : (1 - Math.cos((elong * Math.PI) / 180)) / 2;
    return { bodies, moonAlt, sunAlt, illum, elong };
  }

  function positionAt(target, state) {
    if (!target.moving) return target;
    const body = state.bodies.find((b) => b.name === target.name);
    return body || target;
  }

  function brightnessScore(target) {
    const mag = target.mag;
    if (target.kind === "planet" || target.kind === "moon") {
      if (mag <= 0) return 100;
      if (mag <= 1.2) return 84;
      return 70;
    }
    if (target.kind === "dso") {
      if (mag <= 4) return 78;
      if (mag <= 6) return 52;
      if (mag <= 8) return 28;
      return 14;
    }
    if (mag <= 0.5) return 100;
    if (mag <= 1.5) return 86;
    if (mag <= 2.5) return 68;
    if (mag <= 3.5) return 46;
    return 28;
  }

  function lightScore(bortle, kind) {
    const base = 100 - ((bortle - 1) / 8) * 88;
    if (kind === "dso") return Math.max(0, base - 10);
    if (kind === "planet" || kind === "moon") return Math.min(100, base + 22);
    return Math.max(0, Math.min(100, base));
  }

  function moonScore(moonAlt, illum, kind) {
    if (kind === "moon") return 100;
    if (moonAlt < 0) return 100;
    const harm = (Math.max(0, moonAlt) / 90) * illum;
    const sens = kind === "dso" ? 1 : kind === "planet" ? 0.35 : 0.62;
    return Math.max(0, 100 - harm * 100 * sens);
  }

  function altitudeScore(alt, minAlt) {
    if (alt <= 0) return 0;
    if (alt < minAlt) return Math.max(0, (alt / Math.max(minAlt, 1)) * 34);
    const span = Math.max(20, 72 - minAlt);
    return Math.max(34, Math.min(100, 34 + ((alt - minAlt) / span) * 66));
  }

  function weightsFor(kind) {
    if (kind === "dso") return { A: 0.3, B: 0.15, L: 0.3, M: 0.25 };
    if (kind === "planet" || kind === "moon") return { A: 0.45, B: 0.25, L: 0.15, M: 0.15 };
    return { A: 0.35, B: 0.25, L: 0.25, M: 0.15 };
  }

  function explain(parts, target, minAlt) {
    const lines = [];
    if (parts.alt <= 0) {
      lines.push("이 시각에는 지평선 아래에 있어 관측할 수 없습니다.");
    } else if (parts.alt >= 50) {
      lines.push("고도가 높아 대기의 영향을 상대적으로 덜 받습니다.");
    } else if (parts.alt < minAlt) {
      lines.push(`고도가 기준 ${minAlt}°보다 낮아 지평선 쪽 대기와 방해를 받기 쉽습니다.`);
    } else {
      lines.push(`고도 약 ${parts.alt.toFixed(0)}°로 기준 고도는 넘습니다.`);
    }
    if (parts.sunAlt > 0) lines.push("태양이 지평선 위입니다. 태양 위치는 평균 황경 근사입니다.");
    else if (parts.sunAlt > -6) lines.push("박명에 가깝습니다. 하늘이 아직 밝을 수 있습니다.");
    if (parts.bortle >= 7 && (target.kind === "dso" || target.mag > 2)) {
      lines.push("추정 광공해가 높아 어두운 천체에는 불리합니다. Bortle은 장소 유형으로 추정한 값입니다.");
    } else if (parts.bortle <= 3) {
      lines.push("추정 광공해가 낮아 어두운 별과 성운에 유리한 편입니다.");
    } else {
      lines.push(`추정 Bortle ${parts.bortle}. 광공해 지도 실측이 아닙니다.`);
    }
    if (target.kind !== "moon") {
      if (parts.moonAlt < 0) lines.push("달이 지평선 아래라 달빛 방해가 없습니다. 달 위치·위상은 근사입니다.");
      else if (parts.illum > 0.55 && parts.moonAlt > 15) {
        lines.push("달이 떠 있고 밝아 배경 하늘이 밝아집니다. 어두운 천체에는 불리합니다.");
      } else lines.push("달빛 영향은 제한적입니다. 위상은 태양·달의 각거리로 추정했습니다.");
    }
    if (target.kind === "dso") {
      lines.push("심원천체 밝기는 이 앱이 넣은 대표 등급이며, 카탈로그 원본 등급이 아닙니다.");
    } else if (target.moving) {
      lines.push("행성·달의 밝기는 고정 상수이고, 위치는 평균 황경 근사입니다.");
    }
    return lines;
  }

  function evaluate(target, date, minAlt, state) {
    const snap = state || skyState(date);
    const pos = positionAt(target, snap);
    const { alt, az } = Sky.altAzAt(pos.ra, pos.dec, date);
    const place = Sky.getPlace();
    const bortle = place.located ? place.bortle : 6;
    const A = altitudeScore(alt, minAlt);
    const B = brightnessScore(target);
    const L = lightScore(bortle, target.kind);
    const M = moonScore(snap.moonAlt, snap.illum, target.kind);
    const w = weightsFor(target.kind);
    let S = w.A * A + w.B * B + w.L * L + w.M * M;
    if (alt <= 0) S = 0;
    else if (snap.sunAlt > 0) S *= 0.12;
    else if (snap.sunAlt > -6) S *= 0.45;
    else if (snap.sunAlt > -12) S *= 0.8;
    S = Math.round(Math.max(0, Math.min(100, S)));
    const parts = {
      t: date.getTime(),
      alt,
      az,
      ra: pos.ra,
      dec: pos.dec,
      A: Math.round(A),
      B: Math.round(B),
      L: Math.round(L),
      M: Math.round(M),
      S,
      bortle,
      sunAlt: snap.sunAlt,
      moonAlt: snap.moonAlt,
      illum: snap.illum,
      weights: w,
    };
    parts.reasons = explain(parts, target, minAlt);
    return parts;
  }

  function samples(target, start, end, stepMin, minAlt) {
    const rows = [];
    const step = Math.max(5, stepMin) * 60000;
    for (let t = start.getTime(); t <= end.getTime(); t += step) {
      const date = new Date(t);
      rows.push(evaluate(target, date, minAlt, skyState(date)));
    }
    return rows;
  }

  function ranges(rows, pred) {
    const out = [];
    let cur = null;
    rows.forEach((row) => {
      if (pred(row)) {
        if (!cur) cur = { start: row.t, end: row.t, best: row };
        cur.end = row.t;
        if (row.alt > cur.best.alt) cur.best = row;
      } else if (cur) {
        out.push(cur);
        cur = null;
      }
    });
    if (cur) out.push(cur);
    return out;
  }

  function profile(target, start, end, stepMin, minAlt) {
    const rows = samples(target, start, end, stepMin, minAlt);
    const best = rows.reduce((a, b) => (b.S > a.S ? b : a), rows[0]);
    const peak = rows.reduce((a, b) => (b.alt > a.alt ? b : a), rows[0]);
    return {
      target,
      rows,
      best,
      peak,
      up: ranges(rows, (row) => row.alt > 0),
      good: ranges(rows, (row) => row.alt >= minAlt && row.sunAlt < -6),
    };
  }

  function recommend(start, end, minAlt, limit) {
    return catalogTargets()
      .map((target) => {
        const card = profile(target, start, end, 30, minAlt);
        return {
          target,
          best: card.best,
          peak: card.peak,
          good: card.good,
          up: card.up,
        };
      })
      .sort((a, b) => b.best.S - a.best.S || b.peak.alt - a.peak.alt)
      .slice(0, limit || 12);
  }

  function weekStrip(target, isoDate, minAlt) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(y, m - 1, d + i);
      const iso = toIso(day);
      const night = nightOf(iso);
      const card = profile(target, night.start, night.end, 60, minAlt);
      days.push({ iso, best: card.best, peak: card.peak });
    }
    return days;
  }

  function hop(target, date, mode) {
    const state = skyState(date);
    const pos = positionAt(target, state);
    const nowAlt = Sky.altAzAt(pos.ra, pos.dec, date);
    if (nowAlt.alt <= 0) {
      return { ok: false, reason: "below", alt: nowAlt.alt, target, at: pos };
    }
    const easy = mode === "easy";
    const starSep = easy ? 14 : 18;
    const targetSep = easy ? 18 : 24;
    const startMag = easy ? 2.5 : 3.0;
    const stars = uniqueStars().filter((s) => s.mag <= (easy ? 3.2 : 3.8));
    const goal = {
      id: target.id,
      name: target.name,
      ra: pos.ra,
      dec: pos.dec,
      mag: target.mag,
      kind: target.kind,
    };
    const nodes = stars.filter((s) => angularSep(s.ra, s.dec, goal.ra, goal.dec) > 0.3);
    nodes.push(goal);
    const edges = new Map();
    function addEdge(from, to, cost, sep) {
      if (!edges.has(from)) edges.set(from, []);
      edges.get(from).push({ to, cost, sep });
    }
    nodes.forEach((a) => {
      nodes.forEach((b) => {
        if (a.id === b.id) return;
        const limit = a.id === goal.id || b.id === goal.id ? targetSep : starSep;
        if (a.id === goal.id) return;
        const sep = angularSep(a.ra, a.dec, b.ra, b.dec);
        if (sep < 0.4 || sep > limit) return;
        const faint = b.mag ?? 4;
        const cost = sep * (0.7 + Math.max(0, faint - 1) * 0.42);
        addEdge(a.id, b.id, cost, sep);
      });
    });
    const source = "__start__";
    let starts = stars.filter((s) => s.mag <= startMag && Sky.altAzAt(s.ra, s.dec, date).alt >= 12);
    if (!starts.length) {
      starts = stars.filter((s) => s.mag <= 3.4 && Sky.altAzAt(s.ra, s.dec, date).alt >= 8);
    }
    starts.forEach((s) => {
      const sep = angularSep(s.ra, s.dec, goal.ra, goal.dec);
      addEdge(source, s.id, s.mag * 6 + sep * 0.08, 0);
    });
    const ids = nodes.map((n) => n.id).concat(source);
    const dist = new Map(ids.map((id) => [id, Infinity]));
    const prev = new Map();
    dist.set(source, 0);
    const used = new Set();
    while (used.size < ids.length) {
      let u = null;
      let best = Infinity;
      ids.forEach((id) => {
        if (!used.has(id) && dist.get(id) < best) {
          best = dist.get(id);
          u = id;
        }
      });
      if (u == null || best === Infinity) break;
      used.add(u);
      if (u === goal.id) break;
      (edges.get(u) || []).forEach((edge) => {
        const next = best + edge.cost;
        if (next < dist.get(edge.to)) {
          dist.set(edge.to, next);
          prev.set(edge.to, { id: u, sep: edge.sep });
        }
      });
    }
    if (!Number.isFinite(dist.get(goal.id))) {
      return { ok: false, reason: "no-path", alt: nowAlt.alt, target, at: pos };
    }
    const idPath = [];
    let cursor = goal.id;
    while (cursor && cursor !== source) {
      idPath.push(cursor);
      cursor = prev.get(cursor)?.id;
    }
    idPath.reverse();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const steps = [];
    idPath.forEach((id, i) => {
      const node = byId.get(id);
      const sep = i === 0 ? 0 : prev.get(id)?.sep || angularSep(steps[i - 1].ra, steps[i - 1].dec, node.ra, node.dec);
      const alt = Sky.altAzAt(node.ra, node.dec, date).alt;
      steps.push({ ...node, sep, alt });
    });
    const total = steps.reduce((sum, step) => sum + step.sep, 0);
    return { ok: true, steps, total, alt: nowAlt.alt, target, at: pos, mode: easy ? "easy" : "normal" };
  }

  function toIso(date) {
    const z = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
  }

  function fmtTime(t) {
    return new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function fmtWhen(t) {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${fmtTime(t)}`;
  }

  return {
    KO,
    label,
    fullLabel,
    angularSep,
    uniqueStars,
    catalogTargets,
    find,
    targetById,
    nightOf,
    skyState,
    evaluate,
    profile,
    recommend,
    weekStrip,
    hop,
    toIso,
    fmtTime,
    fmtWhen,
  };
})();
