/* Forecast, visibility matrix, star navigator, and mission control. */
const OrbitaIntel = (() => {
  const root = document.getElementById("intel");
  const body = document.getElementById("intel-body");
  let tab = "forecast";
  let iso = OrbitaEngine.toIso(new Date());
  let minAlt = 25;
  let focusId = "planet:Jupiter";
  let compareIds = [];
  let hopMode = "easy";
  let hopResult = null;
  let hopIndex = 0;
  let kinds = { star: true, planet: true, moon: true, dso: true };
  let matrixPick = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function placeLine() {
    const city = document.getElementById("city-name")?.textContent || "위치 없음";
    const place = Sky.getPlace();
    if (!place.located) {
      return { located: false, city, text: "위치 없음 · GPS를 허용하면 이 자리 기준으로 계산합니다." };
    }
    return {
      located: true,
      city,
      bortle: place.bortle,
      lat: place.lat,
      lon: place.lon,
      text: `${city} · ${place.lat.toFixed(3)}°, ${place.lon.toFixed(3)}° · 추정 Bortle ${place.bortle}`,
    };
  }

  function focusTarget() {
    return OrbitaEngine.targetById(focusId);
  }

  function open(next) {
    if (next) tab = next;
    root.hidden = false;
    root.classList.toggle("intel-nav", tab === "navigator");
    root.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.tab === tab);
    });
    render();
  }

  function close() {
    root.hidden = true;
    Sky.setGuide(null);
  }

  function render() {
    if (!placeLine().located) {
      body.innerHTML = `<p class="intel-empty">위치를 허용해야 고도, 점수, 별 길을 계산합니다. 미리보기 하늘은 위도 0°가 아닙니다. 별이 그려지지 않는 상태입니다.</p>`;
      Sky.setGuide(null);
      return;
    }
    if (tab === "forecast") renderForecast();
    else if (tab === "matrix") renderMatrix();
    else if (tab === "navigator") renderNavigator();
    else renderMission();
    syncGuide();
  }

  function band(score, alt) {
    if (alt <= 0) return "down";
    if (score >= 70) return "good";
    if (score >= 45) return "mid";
    return "low";
  }

  function windowText(ranges) {
    if (!ranges.length) return "이 밤에 기준 고도 위로 올라오지 않습니다.";
    return ranges
      .map((range) => `${OrbitaEngine.fmtWhen(range.start)}–${OrbitaEngine.fmtTime(range.end)}`)
      .join(", ");
  }

  function renderForecast() {
    const place = placeLine();
    const night = OrbitaEngine.nightOf(iso);
    const cards = OrbitaEngine.recommend(night.start, night.end, minAlt, 10);
    const focus = focusTarget();
    const extras = compareIds
      .filter((id) => id !== focusId)
      .map((id) => OrbitaEngine.targetById(id))
      .filter(Boolean);
    const shown = [focus, ...extras].filter(Boolean).slice(0, 3);
    const profiles = shown.map((target) => OrbitaEngine.profile(target, night.start, night.end, 15, minAlt));
    const week = focus ? OrbitaEngine.weekStrip(focus, iso, minAlt) : [];
    const now = Sky.now().getTime();
    body.innerHTML = `
      <div class="intel-tools">
        <label>날짜 <input id="intel-date" type="date" value="${esc(iso)}" /></label>
        <label>기준 고도 <input id="intel-alt" type="number" min="5" max="70" step="1" value="${minAlt}" />°</label>
        <span class="intel-place">${esc(place.text)}</span>
      </div>
      <p class="intel-lead">오늘 밤 ${OrbitaEngine.fmtTime(night.start)}–다음날 ${OrbitaEngine.fmtTime(night.end)}. 추천은 근사 고도·밝기·추정 광공해·근사 달빛을 묶은 지표입니다.</p>
      <div class="intel-split">
        <ol class="intel-list">
          ${cards
            .map((card) => {
              const on = card.target.id === focusId ? " on" : "";
              return `<li class="${on}">
                <button type="button" data-act="focus" data-id="${esc(card.target.id)}">
                  <strong>${esc(OrbitaEngine.fullLabel(card.target))}</strong>
                  <span>최적 ${OrbitaEngine.fmtWhen(card.best.t)} · 최고 ${card.peak.alt.toFixed(0)}° · 지표 ${card.best.S}</span>
                </button>
                <p>${esc(card.best.reasons[0] || "")}</p>
                <div class="intel-row">
                  <button type="button" data-act="mission-add" data-id="${esc(card.target.id)}" data-t="${card.best.t}">미션에 추가</button>
                  <button type="button" data-act="compare" data-id="${esc(card.target.id)}">${compareIds.includes(card.target.id) ? "비교 해제" : "그래프 비교"}</button>
                  <button type="button" data-act="goto-nav" data-id="${esc(card.target.id)}">길 찾기</button>
                </div>
              </li>`;
            })
            .join("")}
        </ol>
        <div>
          <canvas id="alt-chart"></canvas>
          <p class="intel-note">실선은 근사 고도, 점선은 기준 고도 ${minAlt}°와 지평선 0°입니다. 흰 세로선은 지금 시뮬레이션 시각입니다.</p>
          ${
            focus
              ? `<h4>${esc(OrbitaEngine.fullLabel(focus))}</h4>
                 <p>가장 높은 시각 ${OrbitaEngine.fmtWhen(profiles[0].peak.t)} · ${profiles[0].peak.alt.toFixed(0)}° (근사)</p>
                 <p>지표가 가장 높은 시각 ${OrbitaEngine.fmtWhen(profiles[0].best.t)} · 지표 ${profiles[0].best.S}</p>
                 <p>기준 고도 이상, 태양 고도 -6° 미만: ${esc(windowText(profiles[0].good))}</p>
                 <ul class="intel-reasons">${profiles[0].best.reasons.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
                 <div class="week">${week
                   .map(
                     (day) =>
                       `<button type="button" data-act="day" data-iso="${day.iso}" class="${day.iso === iso ? "on" : ""}"><b>${day.iso.slice(5)}</b><span>${day.best.S}</span></button>`
                   )
                   .join("")}</div>
                 <p class="intel-note">7일 숫자는 그 밤의 최고 추천 지표입니다. 날씨·실측 시상은 들어 있지 않습니다.</p>`
              : ""
          }
        </div>
      </div>`;
    const canvas = document.getElementById("alt-chart");
    if (canvas && profiles.length) {
      requestAnimationFrame(() => {
        drawChart(
          canvas,
          profiles.map((card, i) => ({
            color: ["#f0c36a", "#8fd0ff", "#e7a0e0"][i],
            rows: card.rows,
          })),
          minAlt,
          now
        );
      });
    }
  }

  function drawChart(canvas, series, floor, marker) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 320;
    const cssH = 190;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const pad = { l: 34, r: 10, t: 12, b: 22 };
    const ymin = -20;
    const ymax = 90;
    const rows = series[0].rows;
    const t0 = rows[0].t;
    const t1 = rows[rows.length - 1].t;
    const xOf = (t) => pad.l + ((t - t0) / (t1 - t0)) * (cssW - pad.l - pad.r);
    const yOf = (alt) => pad.t + ((ymax - alt) / (ymax - ymin)) * (cssH - pad.t - pad.b);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.moveTo(pad.l, yOf(0));
    ctx.lineTo(cssW - pad.r, yOf(0));
    ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,196,92,0.8)";
    ctx.beginPath();
    ctx.moveTo(pad.l, yOf(floor));
    ctx.lineTo(cssW - pad.r, yOf(floor));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#9aa3bd";
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.fillText("0°", 2, yOf(0) + 3);
    ctx.fillText(`${floor}°`, 2, yOf(floor) + 3);
    series.forEach((seriesItem) => {
      ctx.beginPath();
      seriesItem.rows.forEach((row, i) => {
        const x = xOf(row.t);
        const y = yOf(row.alt);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.strokeStyle = seriesItem.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    if (marker >= t0 && marker <= t1) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(xOf(marker), pad.t);
      ctx.lineTo(xOf(marker), cssH - pad.b);
      ctx.stroke();
    }
    ctx.fillStyle = "#9aa3bd";
    ctx.fillText(OrbitaEngine.fmtTime(t0), pad.l, cssH - 4);
    ctx.fillText(OrbitaEngine.fmtTime(t1), cssW - 46, cssH - 4);
  }

  function renderMatrix() {
    const place = placeLine();
    const night = OrbitaEngine.nightOf(iso);
    const ticks = [];
    for (let t = night.start.getTime(); t <= night.end.getTime(); t += 3600000) ticks.push(t);
    const rows = OrbitaEngine.catalogTargets().filter((target) => kinds[target.kind] !== false);
    const grid = rows.map((target) => ({
      target,
      cells: ticks.map((t) => OrbitaEngine.evaluate(target, new Date(t), minAlt)),
    }));
    grid.sort((a, b) => Math.max(...b.cells.map((c) => c.S)) - Math.max(...a.cells.map((c) => c.S)));
    const bestCell = grid
      .flatMap((row) => row.cells.map((cell) => ({ target: row.target, cell })))
      .sort((a, b) => b.cell.S - a.cell.S)[0];
    body.innerHTML = `
      <div class="intel-tools">
        <label>날짜 <input id="intel-date" type="date" value="${esc(iso)}" /></label>
        <label>기준 고도 <input id="intel-alt" type="number" min="5" max="70" value="${minAlt}" />°</label>
        ${["star", "planet", "moon", "dso"]
          .map(
            (kind) =>
              `<label><input type="checkbox" data-kind="${kind}" ${kinds[kind] ? "checked" : ""} /> ${kind}</label>`
          )
          .join("")}
        <span class="intel-place">${esc(place.text)}</span>
      </div>
      <p class="intel-lead">${
        bestCell
          ? `이 격자에서 지표가 가장 높은 칸은 ${esc(OrbitaEngine.fullLabel(bestCell.target))} ${OrbitaEngine.fmtWhen(bestCell.cell.t)} · ${bestCell.cell.S}입니다.`
          : "표시할 천체가 없습니다."
      } 칸 점수는 관측 성공 확률이 아닙니다.</p>
      <div class="matrix-wrap">
        <table class="matrix">
          <thead><tr><th>천체</th>${ticks.map((t) => `<th>${OrbitaEngine.fmtTime(t)}</th>`).join("")}</tr></thead>
          <tbody>
            ${grid
              .map(
                (row) => `<tr>
                  <th><button type="button" data-act="focus" data-id="${esc(row.target.id)}">${esc(OrbitaEngine.label(row.target))}</button></th>
                  ${row.cells
                    .map(
                      (cell) =>
                        `<td><button type="button" class="cell ${band(cell.S, cell.alt)}" data-act="cell" data-id="${esc(row.target.id)}" data-t="${cell.t}">${cell.alt <= 0 ? "·" : cell.S}</button></td>`
                    )
                    .join("")}
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div id="matrix-detail">${matrixDetailHtml()}</div>`;
  }

  function matrixDetailHtml() {
    if (!matrixPick) return `<p class="intel-note">칸을 누르면 고도, 밝기, 추정 광공해, 달빛으로 나눈 점수가 열립니다.</p>`;
    const target = OrbitaEngine.targetById(matrixPick.id);
    const cell = OrbitaEngine.evaluate(target, new Date(matrixPick.t), minAlt);
    return `
      <h4>${esc(OrbitaEngine.fullLabel(target))} · ${OrbitaEngine.fmtWhen(cell.t)}</h4>
      <p>종합 지표 ${cell.S}. 가중치 A ${cell.weights.A} / B ${cell.weights.B} / L ${cell.weights.L} / M ${cell.weights.M}</p>
      <ul class="score-parts">
        <li>고도 ${cell.alt.toFixed(1)}° · 점수 ${cell.A}</li>
        <li>밝기 점수 ${cell.B} · 등급 ${target.mag} (${esc(magNote(target))})</li>
        <li>광공해 점수 ${cell.L} · 추정 Bortle ${cell.bortle}</li>
        <li>달빛 점수 ${cell.M} · 달 고도 ${cell.moonAlt.toFixed(0)}° · 조도 근사 ${Math.round(cell.illum * 100)}%</li>
        <li>태양 고도 근사 ${cell.sunAlt.toFixed(0)}°</li>
      </ul>
      <ul class="intel-reasons">${cell.reasons.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      <div class="intel-row">
        <button type="button" data-act="mission-add" data-id="${esc(target.id)}" data-t="${cell.t}">미션에 추가</button>
        <button type="button" data-act="goto-nav" data-id="${esc(target.id)}">길 찾기</button>
        <button type="button" data-act="goto-forecast" data-id="${esc(target.id)}">고도 그래프</button>
      </div>`;
  }

  function magNote(target) {
    if (target.magNote === "representative") return "대표 등급, 카탈로그 원본 아님";
    if (target.magNote === "constant") return "고정 밝기 상수";
    return "카탈로그 등급";
  }

  function renderNavigator() {
    const target = focusTarget();
    const options = OrbitaEngine.catalogTargets();
    if (target && !hopResult) runHop();
    body.innerHTML = `
      <div class="intel-tools">
        <label>목표
          <select id="hop-target">
            ${options
              .map(
                (item) =>
                  `<option value="${esc(item.id)}" ${item.id === focusId ? "selected" : ""}>${esc(OrbitaEngine.fullLabel(item))}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>경로 <select id="hop-mode">
          <option value="easy" ${hopMode === "easy" ? "selected" : ""}>초보 · 밝은 별, 짧은 간격</option>
          <option value="normal" ${hopMode === "normal" ? "selected" : ""}>기본</option>
        </select></label>
        <button type="button" data-act="hop-run">다시 계산</button>
      </div>
      ${hopHtml()}
      <p class="intel-note">경로는 catalog.js 안의 별만 사용합니다. 각거리는 적경·적위 사이 각이고, 비용은 각거리에 어두운 별 패널티를 더한 값입니다. 다익스트라로 비용이 작은 길을 고릅니다.</p>`;
  }

  function runHop() {
    const target = focusTarget();
    if (!target) {
      hopResult = null;
      return;
    }
    hopResult = OrbitaEngine.hop(target, Sky.now(), hopMode);
    if (!hopResult.ok && hopResult.reason === "no-path" && hopMode === "easy") {
      const retry = OrbitaEngine.hop(target, Sky.now(), "normal");
      if (retry.ok) hopResult = { ...retry, relaxed: true };
    }
    hopIndex = 0;
  }

  function hopHtml() {
    if (!hopResult) return `<p class="intel-empty">목표를 고르면 길을 계산합니다.</p>`;
    if (!hopResult.ok && hopResult.reason === "below") {
      return `<p class="intel-empty">${esc(OrbitaEngine.fullLabel(hopResult.target))}는 지금 근사 고도 ${hopResult.alt.toFixed(0)}°로 지평선 아래입니다. 안내를 시작하지 않습니다.</p>
        <button type="button" data-act="goto-forecast" data-id="${esc(hopResult.target.id)}">Forecast에서 뜨는 시각 보기</button>`;
    }
    if (!hopResult.ok) {
      return `<p class="intel-empty">이 카탈로그의 밝은 별만으로는 이어지는 길을 찾지 못했습니다. 별 목록이 늘어나면 길이 늘어납니다.</p>`;
    }
    const steps = hopResult.steps;
    return `
      <p>총 각거리 약 ${hopResult.total.toFixed(0)}°. ${hopResult.mode === "easy" ? "초보 경로" : "기본 경로"}${hopResult.relaxed ? " · 초보 간격으로는 이어지지 않아 기본 간격으로 다시 찾았습니다" : ""}. 하늘 위에 점선으로 겹칩니다.</p>
      <ol class="hop-steps">
        ${steps
          .map((step, i) => {
            const title = i === 0 ? "출발 별 확인" : i === steps.length - 1 ? "목표 위치 확인" : "다음 기준 별";
            return `<li class="${i === hopIndex ? "on" : ""}">
              <button type="button" data-act="hop-step" data-i="${i}">
                <b>${i + 1}. ${esc(title)}</b>
                <span>${esc(OrbitaEngine.fullLabel(step))} · 등급 ${Number(step.mag).toFixed(1)} · 고도 ${step.alt.toFixed(0)}°${i ? ` · 이전 별과 ${step.sep.toFixed(1)}°` : ""}</span>
              </button>
            </li>`;
          })
          .join("")}
      </ol>
      <div class="intel-row">
        <button type="button" data-act="hop-prev">이전</button>
        <button type="button" data-act="hop-next">다음 단계</button>
        <button type="button" data-act="hop-save">미션에 경로 저장</button>
      </div>
      <p>${esc(stepSentence(steps[hopIndex], hopIndex, steps.length))}</p>`;
  }

  function stepSentence(step, index, total) {
    if (!step) return "";
    if (index === 0) return `먼저 ${OrbitaEngine.fullLabel(step)}를 찾습니다. 밝은 기준점입니다.`;
    if (index === total - 1) return `마지막입니다. 이전 별에서 약 ${step.sep.toFixed(1)}° 이동하면 ${OrbitaEngine.fullLabel(step)} 방향입니다.`;
    return `${OrbitaEngine.fullLabel(step)} 쪽으로 약 ${step.sep.toFixed(1)}° 이동합니다.`;
  }

  let lastSlew = "";

  function syncGuide() {
    if (root.hidden || tab !== "navigator" || !hopResult?.ok) {
      Sky.setGuide(null);
      lastSlew = "";
      return;
    }
    Sky.setGuide({ steps: hopResult.steps, index: hopIndex });
    const step = hopResult.steps[hopIndex];
    const key = `${hopResult.total}:${hopIndex}:${step?.name || ""}`;
    if (step && key !== lastSlew) {
      lastSlew = key;
      Sky.slewToRaDec(step.ra, step.dec);
    }
  }

  function renderMission() {
    const missions = OrbitaMissions.load();
    const current = OrbitaMissions.active();
    body.innerHTML = `
      <div class="intel-tools">
        <button type="button" data-act="mission-new">이 날짜로 미션 만들기</button>
        <button type="button" data-act="mission-export">JSON 백업</button>
        <label class="file-btn">JSON 복원 <input id="mission-file" type="file" accept="application/json" hidden /></label>
      </div>
      <p class="intel-note">기록은 이 브라우저의 localStorage에만 있습니다. 다른 기기와 동기화되지 않습니다.</p>
      <ul class="mission-index">
        ${
          missions.length
            ? missions
                .map((mission) => {
                  const prog = OrbitaMissions.progress(mission);
                  return `<li class="${current && current.id === mission.id ? "on" : ""}">
                    <button type="button" data-act="mission-open" data-mid="${esc(mission.id)}">
                      <strong>${esc(mission.name)}</strong>
                      <span>${esc(mission.date)} · ${prog.done}/${prog.total} 성공 · ${Math.round(prog.ratio * 100)}%</span>
                    </button>
                  </li>`;
                })
                .join("")
            : `<li>저장된 미션이 없습니다.</li>`
        }
      </ul>
      ${current ? missionDetail(current) : ""}`;
  }

  function missionDetail(mission) {
    const prog = OrbitaMissions.progress(mission);
    const place = mission.place
      ? `${mission.place.name || "위치"} · 추정 Bortle ${mission.place.bortle}`
      : "위치를 저장하지 않음";
    return `
      <article class="mission">
        <h4>${esc(mission.name)}</h4>
        <p>${esc(mission.date)} · ${esc(place)} · 성공 ${prog.done} / 시도 ${prog.tried} / 목표 ${prog.total}</p>
        <div class="intel-row">
          <button type="button" data-act="mission-sort" data-mid="${esc(mission.id)}">예정 시각순</button>
          <button type="button" data-act="mission-report" data-mid="${esc(mission.id)}">HTML 보고서</button>
          <button type="button" data-act="mission-delete" data-mid="${esc(mission.id)}">삭제</button>
        </div>
        <label class="stack">미션 메모
          <textarea data-field="mission-note" data-mid="${esc(mission.id)}">${esc(mission.notes || "")}</textarea>
        </label>
        <ol class="mission-targets">
          ${mission.targets
            .map((target, index) => {
              const checks = target.checks || {};
              return `<li>
                <header>
                  <strong>${index + 1}. ${esc(OrbitaEngine.fullLabel(target))}</strong>
                  <span>${target.plannedTime ? `예정 ${OrbitaEngine.fmtWhen(target.plannedTime)} · 지표 ${target.plannedScore ?? "—"} · 고도 ${target.plannedAlt != null ? Number(target.plannedAlt).toFixed(0) : "—"}°` : "예정 시각 없음"}</span>
                </header>
                <div class="intel-row">
                  <button type="button" data-act="mission-move" data-mid="${esc(mission.id)}" data-id="${esc(target.id)}" data-dir="-1">위로</button>
                  <button type="button" data-act="mission-move" data-mid="${esc(mission.id)}" data-id="${esc(target.id)}" data-dir="1">아래로</button>
                  <button type="button" data-act="goto-nav" data-id="${esc(target.id)}">길 찾기</button>
                  <button type="button" data-act="mission-drop" data-mid="${esc(mission.id)}" data-id="${esc(target.id)}">빼기</button>
                </div>
                <div class="checks">
                  ${checkBtn(mission.id, target, "located", "위치 확인")}
                  ${checkBtn(mission.id, target, "conditions", "조건 확인")}
                  ${checkBtn(mission.id, target, "attempted", "관측 시도")}
                  <label>결과
                    <select data-field="success" data-mid="${esc(mission.id)}" data-id="${esc(target.id)}">
                      <option value="" ${checks.success == null ? "selected" : ""}>미기록</option>
                      <option value="yes" ${checks.success === "yes" ? "selected" : ""}>성공</option>
                      <option value="no" ${checks.success === "no" ? "selected" : ""}>실패</option>
                    </select>
                  </label>
                </div>
                ${
                  target.hop
                    ? `<p class="intel-note">저장된 길 ${target.hop.steps.map((s) => esc(s.name)).join(" → ")} · 약 ${Number(target.hop.total).toFixed(0)}°</p>`
                    : ""
                }
                <textarea data-field="target-note" data-mid="${esc(mission.id)}" data-id="${esc(target.id)}" placeholder="메모">${esc(target.note || "")}</textarea>
              </li>`;
            })
            .join("") || `<li>아직 천체가 없습니다. Forecast나 Matrix에서 추가하세요.</li>`}
        </ol>
      </article>`;
  }

  function checkBtn(mid, target, key, text) {
    const on = target.checks && target.checks[key] ? " on" : "";
    return `<button type="button" class="check${on}" data-act="check" data-mid="${esc(mid)}" data-id="${esc(target.id)}" data-key="${key}">${text}</button>`;
  }

  function addToMission(id, t) {
    const target = OrbitaEngine.targetById(id);
    if (!target) return;
    const when = t ? new Date(Number(t)) : Sky.now();
    const sample = OrbitaEngine.evaluate(target, when, minAlt);
    let mission = OrbitaMissions.active();
    if (!mission) mission = createMission();
    const snap = { ...target, ra: sample.ra, dec: sample.dec };
    OrbitaMissions.addTarget(mission.id, snap, sample);
    tab = "mission";
    open("mission");
  }

  function createMission() {
    const night = OrbitaEngine.nightOf(iso);
    const place = Sky.getPlace();
    const city = document.getElementById("city-name")?.textContent || "";
    return OrbitaMissions.create({
      name: `${iso} 관측`,
      date: iso,
      start: night.start.toISOString(),
      end: night.end.toISOString(),
      place: place.located
        ? { name: city, lat: place.lat, lon: place.lon, bortle: place.bortle, bortleEstimated: true }
        : null,
      targets: [],
    });
  }

  function reportHtml(mission) {
    const prog = OrbitaMissions.progress(mission);
    const items = mission.targets
      .map((target, i) => {
        const success = target.checks.success === "yes" ? "성공" : target.checks.success === "no" ? "실패" : "미기록";
        return `<li><b>${i + 1}. ${esc(OrbitaEngine.fullLabel(target))}</b> — ${success}
          ${target.plannedTime ? `· 예정 ${esc(OrbitaEngine.fmtWhen(target.plannedTime))} · 지표 ${target.plannedScore}` : ""}
          <br />${esc(target.note || "")}</li>`;
      })
      .join("");
    return `<!DOCTYPE html><html lang="ko"><meta charset="utf-8"><title>${esc(mission.name)}</title>
      <body><h1>${esc(mission.name)}</h1>
      <p>${esc(mission.date)} · 성공 ${prog.done}/${prog.total}</p>
      <p>이 보고서의 고도와 지표는 Orbita 근사 계산입니다. Bortle은 추정값입니다.</p>
      <ol>${items}</ol><p>${esc(mission.notes || "")}</p></body></html>`;
  }

  function onClick(event) {
    if (event.target.closest("#intel-close")) {
      close();
      return;
    }
    const tabBtn = event.target.closest("[data-tab]");
    if (tabBtn && root.contains(tabBtn)) {
      open(tabBtn.dataset.tab);
      return;
    }
    const btn = event.target.closest("[data-act]");
    if (!btn || !root.contains(btn)) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (act === "focus" || act === "goto-forecast") {
      focusId = id;
      hopResult = null;
      open(act === "goto-forecast" ? "forecast" : tab);
      return;
    }
    if (act === "goto-nav") {
      focusId = id;
      hopResult = null;
      open("navigator");
      return;
    }
    if (act === "compare") {
      if (compareIds.includes(id)) compareIds = compareIds.filter((item) => item !== id);
      else compareIds = compareIds.concat(id).slice(-2);
      render();
      return;
    }
    if (act === "day") {
      iso = btn.dataset.iso;
      render();
      return;
    }
    if (act === "mission-add") {
      addToMission(id, btn.dataset.t);
      return;
    }
    if (act === "cell") {
      matrixPick = { id, t: Number(btn.dataset.t) };
      focusId = id;
      const slot = document.getElementById("matrix-detail");
      if (slot) slot.innerHTML = matrixDetailHtml();
      return;
    }
    if (act === "hop-run") {
      runHop();
      render();
      return;
    }
    if (act === "hop-step") {
      hopIndex = Number(btn.dataset.i);
      render();
      return;
    }
    if (act === "hop-prev" || act === "hop-next") {
      if (!hopResult?.ok) return;
      hopIndex = Math.max(0, Math.min(hopResult.steps.length - 1, hopIndex + (act === "hop-next" ? 1 : -1)));
      render();
      return;
    }
    if (act === "hop-save") {
      const mission = OrbitaMissions.active() || createMission();
      const target = focusTarget();
      if (target && hopResult?.ok) {
        const sample = OrbitaEngine.evaluate(target, Sky.now(), minAlt);
        OrbitaMissions.addTarget(mission.id, { ...target, ra: sample.ra, dec: sample.dec }, sample);
        OrbitaMissions.saveHop(mission.id, target.id, hopResult);
      }
      open("mission");
      return;
    }
    if (act === "mission-new") {
      createMission();
      render();
      return;
    }
    if (act === "mission-open") {
      OrbitaMissions.setActive(btn.dataset.mid);
      render();
      return;
    }
    if (act === "mission-sort") {
      OrbitaMissions.sortByPlan(btn.dataset.mid);
      render();
      return;
    }
    if (act === "mission-delete") {
      OrbitaMissions.remove(btn.dataset.mid);
      render();
      return;
    }
    if (act === "mission-drop") {
      OrbitaMissions.removeTarget(btn.dataset.mid, id);
      render();
      return;
    }
    if (act === "mission-move") {
      OrbitaMissions.move(btn.dataset.mid, id, Number(btn.dataset.dir));
      render();
      return;
    }
    if (act === "check") {
      const mission = OrbitaMissions.load().find((item) => item.id === btn.dataset.mid);
      const row = mission?.targets.find((item) => item.id === id);
      if (row) OrbitaMissions.setCheck(mission.id, id, btn.dataset.key, !row.checks[btn.dataset.key]);
      render();
      return;
    }
    if (act === "mission-export") {
      download(`orbita-missions.json`, OrbitaMissions.exportAll(), "application/json");
      return;
    }
    if (act === "mission-report") {
      const mission = OrbitaMissions.load().find((item) => item.id === btn.dataset.mid);
      if (mission) download(`${mission.name}.html`, reportHtml(mission), "text/html");
    }
  }

  function onChange(event) {
    const el = event.target;
    if (el.id === "intel-date") {
      iso = el.value || iso;
      matrixPick = null;
      render();
      return;
    }
    if (el.id === "intel-alt") {
      minAlt = Math.max(5, Math.min(70, Number(el.value) || 25));
      matrixPick = null;
      render();
      return;
    }
    if (el.dataset.kind) {
      kinds[el.dataset.kind] = el.checked;
      render();
      return;
    }
    if (el.id === "hop-target") {
      focusId = el.value;
      hopResult = null;
      render();
      return;
    }
    if (el.id === "hop-mode") {
      hopMode = el.value;
      hopResult = null;
      render();
      return;
    }
    if (el.id === "mission-file" && el.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          OrbitaMissions.importAll(String(reader.result));
          render();
        } catch (_) {
          window.alert("JSON 형식을 읽지 못했습니다.");
        }
      };
      reader.readAsText(el.files[0]);
      return;
    }
    if (el.dataset.field === "success") {
      OrbitaMissions.setCheck(el.dataset.mid, el.dataset.id, "success", el.value || null);
      return;
    }
    if (el.dataset.field === "target-note") {
      OrbitaMissions.setNote(el.dataset.mid, el.dataset.id, el.value);
      return;
    }
    if (el.dataset.field === "mission-note") {
      OrbitaMissions.setMissionNote(el.dataset.mid, el.value);
    }
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("input", (event) => {
    const el = event.target;
    if (el.dataset.field === "target-note") OrbitaMissions.setNote(el.dataset.mid, el.dataset.id, el.value);
    if (el.dataset.field === "mission-note") OrbitaMissions.setMissionNote(el.dataset.mid, el.value);
  });
  let lastPlace = "";
  window.addEventListener("orbita-place", () => {
    const text = placeLine().text;
    if (text === lastPlace) return;
    lastPlace = text;
    if (!root.hidden) render();
  });

  return { open, close };
})();
