const drawer = document.getElementById("drawer");
const scrim = document.getElementById("scrim");
const intro = document.getElementById("intro");
const observeMenu = document.getElementById("observe-menu");
const panels = {
  loc: document.getElementById("panel-loc"),
  time: document.getElementById("panel-time"),
  pollution: document.getElementById("panel-pollution"),
  ranking: document.getElementById("panel-ranking"),
  about: document.getElementById("panel-about"),
  observe: document.getElementById("panel-observe"),
};

function hidePanels() {
  Object.values(panels).forEach((el) => {
    el.hidden = true;
  });
}

function openPanel(name) {
  hidePanels();
  observeMenu.hidden = true;
  drawer.hidden = true;
  scrim.hidden = true;
  if (panels[name]) panels[name].hidden = false;
}

document.getElementById("menu-btn").addEventListener("click", () => {
  drawer.hidden = false;
  scrim.hidden = false;
  observeMenu.hidden = true;
});

scrim.addEventListener("click", () => {
  drawer.hidden = true;
  scrim.hidden = true;
});

document.getElementById("observe-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  observeMenu.hidden = !observeMenu.hidden;
});

document.body.addEventListener("click", (e) => {
  if (!e.target.closest(".observe-wrap")) observeMenu.hidden = true;
});

document.querySelectorAll("[data-panel]").forEach((btn) => {
  btn.addEventListener("click", () => openPanel(btn.dataset.panel));
});

document.getElementById("loc-btn").addEventListener("click", () => {
  panels.loc.hidden = !panels.loc.hidden;
  panels.time.hidden = true;
});

document.getElementById("time-btn").addEventListener("click", () => {
  panels.time.hidden = !panels.time.hidden;
  panels.loc.hidden = true;
});

document.querySelectorAll("[data-az]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    Sky.lookAz(Number(btn.dataset.az));
  });
});

document.querySelectorAll(".toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.classList.toggle("on");
    Sky.setFlag(btn.dataset.flag, btn.classList.contains("on"));
  });
});

function tickClock() {
  const now = Sky.now();
  const time = now.toLocaleTimeString("ko-KR", { hour12: false });
  const date = now.toISOString().slice(0, 10);
  document.getElementById("clock").textContent = time;
  document.getElementById("date-line").textContent = date;
  document.getElementById("time-clock").textContent = time;
  document.getElementById("time-date").textContent = date;
  document.getElementById("time-btn").title = now.toLocaleString();
}

tickClock();
setInterval(tickClock, 250);

document.getElementById("time-rew").addEventListener("click", () => Sky.shiftHours(-1));
document.getElementById("time-fwd").addEventListener("click", () => Sky.shiftHours(1));
document.getElementById("time-1x").addEventListener("click", () => Sky.setTimeScale(1));
document.getElementById("time-fast").addEventListener("click", () => Sky.setTimeScale(60));
document.getElementById("time-now").addEventListener("click", () => Sky.resetTime());
document.getElementById("time-pause").addEventListener("click", () => {
  Sky.setTimeScale(Sky.getTimeScale() === 0 ? 1 : 0);
});

function fillRanking() {
  const list = document.getElementById("rank-list");
  if (!Sky.isLocated()) {
    list.innerHTML =
      "<li>위치를 공유하면 지금 이 하늘에서 잘 보이는 별자리 순위를 계산합니다.</li>";
    return;
  }
  const rows = Sky.visibleRanking();
  list.innerHTML = rows.length
    ? rows
        .map(
          (c, i) =>
            `<li>${c.ko || c.name} <span>${c.name} · ${Math.round((c.alt * 180) / Math.PI)}° 고도 · ${i === 0 ? "가장 잘 보임" : "관측 가능"}</span></li>`
        )
        .join("")
    : "<li>지금은 주요 별자리가 지평선 아래에 있습니다.</li>";
}

fillRanking();
setInterval(fillRanking, 15000);

const searchInput = document.getElementById("search");
const suggest = document.getElementById("suggest");

function catalogHits(q) {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];
  const stars = (window.CATALOG?.stars || [])
    .filter((s) => s[0].toLowerCase().includes(query))
    .slice(0, 6)
    .map((s) => ({ label: s[0], kind: "star", query: s[0] }));
  const cons = (window.CATALOG?.constellations || [])
    .filter((c) => c.name.toLowerCase().includes(query) || (c.ko && c.ko.includes(q.trim())))
    .slice(0, 4)
    .map((c) => ({ label: c.name, kind: c.ko || "constellation", query: c.name }));
  return stars.concat(cons).slice(0, 8);
}

function runSearch(q) {
  Sky.search(q);
  suggest.hidden = true;
  hidePanels();
}

searchInput.addEventListener("input", () => {
  const hits = catalogHits(searchInput.value);
  if (!hits.length) {
    suggest.hidden = true;
    return;
  }
  suggest.hidden = false;
  suggest.innerHTML = hits
    .map((h) => `<li><button type="button" data-q="${h.query}">${h.label} <small>${h.kind}</small></button></li>`)
    .join("");
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  runSearch(searchInput.value);
});

suggest.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  searchInput.value = btn.dataset.q;
  runSearch(btn.dataset.q);
});

document.body.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) suggest.hidden = true;
});

function finishIntro() {
  intro.style.transition = "opacity 0.7s ease";
  intro.style.opacity = "0";
  setTimeout(() => {
    intro.remove();
  }, 700);
}

if (new URLSearchParams(location.search).has("skip")) {
  intro.remove();
} else {
  window.onOrbitaIntroDone = finishIntro;
  document.getElementById("skip").addEventListener("click", finishIntro);
}

const BORTLE_LABEL = {
  1: "최고 암흑 지대",
  2: "전형적 암흑 지대",
  3: "시골 하늘",
  4: "시골·교외 전환",
  5: "교외 하늘",
  6: "밝은 교외",
  7: "교외·도시",
  8: "도시 하늘",
  9: "도심 하늘",
};

const BORTLE_HINT = {
  1: "은하수가 입체적으로 보이고 아주 어두운 별까지 보입니다.",
  2: "은하수가 뚜렷하고 한계등급이 매우 깊습니다.",
  3: "시골 하늘입니다. 은하수와 성운이 잘 보입니다.",
  4: "지평선 쪽이 밝고, 은하수는 아직 보입니다.",
  5: "교외 하늘입니다. 밝은 별자리 선은 살아 있습니다.",
  6: "은하수가 거의 사라지고 밝은 별 위주로 보입니다.",
  7: "도시 가장자리입니다. 1~3등성 위주, 은하수는 거의 안 보입니다.",
  8: "도시 하늘입니다. 밝은 별과 행성만 또렷합니다.",
  9: "도심입니다. 아주 밝은 별만 남고 하늘이 뿌옇습니다.",
};

(function buildPollutionTicks() {
  const ticks = document.getElementById("ph-ticks");
  ticks.innerHTML = Array.from({ length: 9 }, (_, i) => `<li data-n="${i + 1}"></li>`).join("");
  const legend = document.getElementById("bortle-legend");
  legend.innerHTML = Object.entries(BORTLE_LABEL)
    .map(([n, label]) => `<li data-n="${n}">${n} · ${label}</li>`)
    .join("");
})();

function setPollutionUi(bortle, placeName) {
  const hud = document.getElementById("pollution-hud");
  const mag = Sky.magLimit().toFixed(1);
  const located = Sky.isLocated() && typeof bortle === "number";
  const fill = `${located ? (bortle / 9) * 100 : 0}%`;
  document.getElementById("meter-fill").style.width = fill;
  document.getElementById("meter-fill-panel").style.width = fill;
  document.querySelectorAll("#ph-ticks li, #bortle-legend li").forEach((el) => {
    el.classList.toggle("on", located && Number(el.dataset.n) === bortle);
  });
  if (!located) {
    hud.classList.remove("live");
    document.getElementById("ph-bortle").textContent = "Bortle —";
    document.getElementById("ph-label").textContent = "위치 없음";
    document.getElementById("ph-meta").textContent = "GPS를 허용하면 이 하늘 기준으로 정도를 계산합니다.";
    document.getElementById("bortle-big").textContent = "Bortle —";
    document.getElementById("loc-pollution").textContent = "빛 공해 · 위치 없음";
    document.getElementById("pollution-mini").textContent = "빛 공해 · 위치 없음";
    document.getElementById("pollution-text").textContent =
      "위치를 허용해야 이 자리의 빛 공해와 잘 보이는 별자리를 계산합니다.";
    return;
  }
  hud.classList.add("live");
  document.getElementById("ph-bortle").textContent = `Bortle ${bortle}`;
  document.getElementById("ph-label").textContent = BORTLE_LABEL[bortle];
  document.getElementById("ph-meta").textContent =
    `한계등급 약 ${mag}등 · ${BORTLE_HINT[bortle]}`;
  document.getElementById("bortle-big").textContent = `Bortle ${bortle}`;
  document.getElementById("loc-pollution").textContent =
    `빛 공해 · Bortle ${bortle} · ${BORTLE_LABEL[bortle]}`;
  document.getElementById("pollution-mini").textContent =
    `빛 공해 · Bortle ${bortle} · ${BORTLE_LABEL[bortle]}`;
  document.getElementById("pollution-text").textContent =
    `${placeName} 기준 예상 Bortle ${bortle} (${BORTLE_LABEL[bortle]}). 한계등급 약 ${mag}등. ${BORTLE_HINT[bortle]} 이 위치의 하늘을 기준으로 별 밝기를 맞췄습니다.`;
}

document.getElementById("pollution-hud").addEventListener("click", () => {
  openPanel("pollution");
});

function formatCoords(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lon).toFixed(4)}°${ew}`;
}

function bortleFromPlace(info) {
  const type = `${info.type || ""} ${info.addresstype || ""} ${info.kind || ""}`.toLowerCase();
  if (/hamlet|isolated|farm|forest|park|nature/.test(type)) return 3;
  if (/village|rural/.test(type)) return 4;
  if (/town/.test(type)) return 5;
  if (/suburb|neighbourhood|neighborhood|residential/.test(type)) return 6;
  if (/city|municipality|industrial|commercial/.test(type)) return 7;
  if (info.importance >= 0.7) return 8;
  if (info.importance >= 0.45) return 6;
  return 5;
}

function showGpsToast(text) {
  const toast = document.getElementById("gps-toast");
  toast.hidden = false;
  toast.textContent = text;
  clearTimeout(showGpsToast.timer);
  showGpsToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

let lastFix = null;
let lookupSeq = 0;
let geoWatchId = null;

function setLocatingUi() {
  document.getElementById("loc-chip").textContent = "위치 확인 중…";
  document.getElementById("loc-chip").classList.remove("live");
  document.getElementById("city-name").textContent = "위치 확인 중…";
  document.getElementById("coords").textContent = "기기 GPS를 사용합니다";
}

function setUnlocatedUi() {
  Sky.clearLocation();
  lastFix = null;
  document.getElementById("loc-chip").textContent = "위치 없음 · 미리보기 하늘";
  document.getElementById("loc-chip").classList.remove("live");
  document.getElementById("loc-btn").classList.remove("live");
  document.getElementById("loc-label").textContent = "위치 없음";
  document.getElementById("city-name").textContent = "위치 공유 안 됨";
  document.getElementById("coords").textContent = "공유하면 실제 위치의 하늘·별자리·빛 공해로 바뀝니다";
  setPollutionUi(null);
  fillRanking();
}

function applyLocation(lat, lon, place, source, quiet) {
  const bortle = place.bortle;
  const firstLock = !Sky.isLocated();
  Sky.setLocation(lat, lon, bortle, { resetView: firstLock });
  lastFix = { lat, lon, name: place.name, source };
  document.getElementById("city-name").textContent = place.name;
  document.getElementById("coords").textContent = formatCoords(lat, lon);
  setPollutionUi(bortle, place.name);
  const tag = source === "GPS" ? "GPS" : source === "IP" ? "추정" : source;
  document.getElementById("loc-chip").textContent = `${tag} · ${place.name}`;
  document.getElementById("loc-chip").classList.add("live");
  document.getElementById("loc-btn").classList.add("live");
  document.getElementById("loc-label").textContent = place.name.toUpperCase();
  fillRanking();
  if (firstLock && !quiet) {
    const msg = source === "GPS" ? `GPS 연결 · ${place.name} 하늘로 전환` : `위치 연결 · ${place.name}`;
    showGpsToast(msg);
  }
}

function movedEnough(lat, lon) {
  if (!lastFix) return true;
  const dlat = lat - lastFix.lat;
  const dlon = lon - lastFix.lon;
  return dlat * dlat + dlon * dlon > 4e-7;
}

async function fetchJson(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupPlace(lat, lon) {
  const cloud = await fetchJson(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`,
    4500
  );
  if (cloud) {
    const name =
      cloud.city ||
      cloud.locality ||
      cloud.principalSubdivision ||
      cloud.countryName ||
      "현재 위치";
    return { name, kind: cloud.city ? "city" : "", importance: cloud.city ? 0.6 : 0.35, bortle: 0 };
  }
  const osm = await fetchJson(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ko`,
    4500
  );
  if (osm) {
    const a = osm.address || {};
    const name =
      a.city || a.town || a.village || a.hamlet || a.suburb || a.county || a.country || "현재 위치";
    return {
      name,
      type: osm.type,
      addresstype: osm.addresstype,
      importance: osm.importance || 0,
      bortle: 0,
    };
  }
  return { name: "현재 위치", type: "", importance: 0.4, bortle: 0 };
}

async function lockCoords(lat, lon, source) {
  const seq = (lookupSeq += 1);
  const firstLock = !Sky.isLocated();
  if (firstLock || movedEnough(lat, lon)) {
    applyLocation(
      lat,
      lon,
      { name: lastFix?.name || "현재 위치", bortle: lastFix ? Sky.getBortle() : 6 },
      source,
      true
    );
  }
  const place = await lookupPlace(lat, lon);
  if (seq !== lookupSeq) return;
  place.bortle = bortleFromPlace(place);
  applyLocation(lat, lon, place, source, !firstLock);
  if (firstLock) {
    showGpsToast(source === "GPS" ? `GPS 연결 · ${place.name} 하늘로 전환` : `위치 연결 · ${place.name}`);
  }
}

function onGeoSuccess(pos) {
  const { latitude: lat, longitude: lon } = pos.coords;
  lockCoords(lat, lon, "GPS");
}

async function fallbackIpLocation() {
  const data = await fetchJson(
    "https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=ko",
    4500
  );
  if (!data || typeof data.latitude !== "number" || typeof data.longitude !== "number") return false;
  const name = data.city || data.locality || data.principalSubdivision || "현재 위치";
  const place = {
    name,
    kind: data.city ? "city" : "",
    importance: data.city ? 0.6 : 0.35,
    bortle: 0,
  };
  place.bortle = bortleFromPlace(place);
  applyLocation(data.latitude, data.longitude, place, "IP");
  return true;
}

function onGeoError(err) {
  if (Sky.isLocated()) return;
  fallbackIpLocation().then((ok) => {
    if (ok) return;
    setUnlocatedUi();
    const city = document.getElementById("city-name");
    if (err && err.code === 1) {
      city.textContent = "위치 권한이 필요합니다";
      document.getElementById("coords").textContent = "브라우저에서 위치 접근을 허용해 주세요";
    } else {
      city.textContent = "위치를 찾지 못했습니다";
      document.getElementById("coords").textContent = "현재 위치 다시 찾기를 눌러 보세요";
    }
  });
}

function startWatch() {
  if (!navigator.geolocation || geoWatchId != null) return;
  geoWatchId = navigator.geolocation.watchPosition(onGeoSuccess, () => {}, {
    enableHighAccuracy: true,
    maximumAge: 15000,
  });
}

function requestLocation() {
  setLocatingUi();
  if (!navigator.geolocation) {
    onGeoError({ code: 2 });
    return;
  }
  navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError, {
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 60000,
  });
  startWatch();
}

document.getElementById("relocate-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  requestLocation();
});

requestLocation();
