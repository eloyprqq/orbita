/* Observation missions stay in this browser only. */
const OrbitaMissions = (() => {
  const KEY = "orbita.missions.v1";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function save(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
    return list;
  }

  function uid() {
    return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function blankTarget(target, plan) {
    return {
      id: target.id,
      name: target.name,
      kind: target.kind,
      ra: target.ra,
      dec: target.dec,
      mag: target.mag,
      moving: !!target.moving,
      magNote: target.magNote || "catalog",
      plannedTime: plan?.t || null,
      plannedAlt: plan?.alt ?? null,
      plannedScore: plan?.S ?? null,
      checks: { located: false, conditions: false, attempted: false, success: null },
      note: "",
      hop: null,
    };
  }

  function create(draft) {
    const list = load();
    const mission = {
      id: uid(),
      name: draft.name || "오늘 밤 관측",
      date: draft.date,
      start: draft.start,
      end: draft.end,
      place: draft.place || null,
      notes: "",
      targets: draft.targets || [],
      createdAt: Date.now(),
    };
    list.unshift(mission);
    save(list);
    localStorage.setItem("orbita.activeMission", mission.id);
    return mission;
  }

  function active() {
    const id = localStorage.getItem("orbita.activeMission");
    return load().find((m) => m.id === id) || load()[0] || null;
  }

  function setActive(id) {
    localStorage.setItem("orbita.activeMission", id);
  }

  function update(id, mutator) {
    const list = load();
    const mission = list.find((m) => m.id === id);
    if (!mission) return null;
    mutator(mission);
    save(list);
    return mission;
  }

  function addTarget(missionId, target, plan) {
    return update(missionId, (mission) => {
      if (mission.targets.some((t) => t.id === target.id)) return;
      mission.targets.push(blankTarget(target, plan));
    });
  }

  function removeTarget(missionId, targetId) {
    return update(missionId, (mission) => {
      mission.targets = mission.targets.filter((t) => t.id !== targetId);
    });
  }

  function move(missionId, targetId, dir) {
    return update(missionId, (mission) => {
      const i = mission.targets.findIndex((t) => t.id === targetId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= mission.targets.length) return;
      const [row] = mission.targets.splice(i, 1);
      mission.targets.splice(j, 0, row);
    });
  }

  function sortByPlan(missionId) {
    return update(missionId, (mission) => {
      mission.targets.sort((a, b) => {
        if (a.plannedTime == null) return 1;
        if (b.plannedTime == null) return -1;
        return a.plannedTime - b.plannedTime;
      });
    });
  }

  function setCheck(missionId, targetId, key, value) {
    return update(missionId, (mission) => {
      const row = mission.targets.find((t) => t.id === targetId);
      if (!row) return;
      row.checks[key] = value;
    });
  }

  function setNote(missionId, targetId, note) {
    return update(missionId, (mission) => {
      const row = mission.targets.find((t) => t.id === targetId);
      if (row) row.note = note;
    });
  }

  function setMissionNote(missionId, notes) {
    return update(missionId, (mission) => {
      mission.notes = notes;
    });
  }

  function saveHop(missionId, targetId, hop) {
    return update(missionId, (mission) => {
      const row = mission.targets.find((t) => t.id === targetId);
      if (!row || !hop?.ok) return;
      row.hop = {
        savedAt: Date.now(),
        total: hop.total,
        steps: hop.steps.map((s) => ({ name: s.name, ra: s.ra, dec: s.dec, mag: s.mag, sep: s.sep })),
      };
    });
  }

  function remove(id) {
    const list = load().filter((m) => m.id !== id);
    save(list);
    if (localStorage.getItem("orbita.activeMission") === id) {
      localStorage.setItem("orbita.activeMission", list[0]?.id || "");
    }
  }

  function progress(mission) {
    const total = mission.targets.length;
    const done = mission.targets.filter((t) => t.checks.success === "yes").length;
    const tried = mission.targets.filter((t) => t.checks.attempted).length;
    return { total, done, tried, ratio: total ? done / total : 0 };
  }

  function exportAll() {
    return JSON.stringify({ version: 1, exportedAt: Date.now(), missions: load() }, null, 2);
  }

  function importAll(text) {
    const data = JSON.parse(text);
    const missions = Array.isArray(data) ? data : data.missions;
    if (!Array.isArray(missions)) throw new Error("형식 오류");
    save(missions);
    return missions;
  }

  return {
    load,
    create,
    active,
    setActive,
    update,
    addTarget,
    removeTarget,
    move,
    sortByPlan,
    setCheck,
    setNote,
    setMissionNote,
    saveHop,
    remove,
    progress,
    exportAll,
    importAll,
    blankTarget,
  };
})();
