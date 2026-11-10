/* What is worth looking at right now, in plain Korean. */
const OrbitaTonight = (() => {
  const root = document.getElementById("tonight");
  const list = document.getElementById("tonight-list");

  function heightWord(alt) {
    if (alt >= 60) return "머리 위";
    if (alt >= 35) return "하늘 중간";
    if (alt >= 12) return "낮은 하늘";
    return "지평선 근처";
  }

  function refresh() {
    const basic = document.documentElement.dataset.mode !== "expert";
    if (!root || !list) return;
    if (!basic || !Sky.isLocated() || typeof OrbitaEngine === "undefined" || !OrbitaEngine.nowList) {
      root.hidden = true;
      return;
    }
    const rows = OrbitaEngine.nowList(Sky.now(), 3);
    root.hidden = false;
    if (!rows.length) {
      list.innerHTML = "<p>지금은 눈에 잘 띄는 별이 지평선 아래에 있어요.</p>";
      return;
    }
    list.innerHTML = rows
      .map((row) => {
        const name = OrbitaEngine.label(row.target);
        const where = heightWord(row.parts.alt);
        return `<button type="button" data-id="${row.target.id}">
          <strong>${name}</strong>
          <span>${where}</span>
        </button>`;
      })
      .join("");
  }

  if (list) {
    list.addEventListener("click", (event) => {
      const btn = event.target.closest("button");
      if (!btn || typeof OrbitaAim === "undefined") return;
      const found = OrbitaEngine.targetById(btn.dataset.id);
      if (!found) return;
      OrbitaAim.pin({
        id: found.id,
        name: OrbitaEngine.label(found),
        ra: found.ra,
        dec: found.dec,
        moving: !!found.moving,
        body: found.name,
      });
    });
  }

  document.getElementById("mode-basic")?.addEventListener("click", () => setTimeout(refresh, 0));
  document.getElementById("mode-expert")?.addEventListener("click", () => setTimeout(refresh, 0));
  refresh();
  setInterval(refresh, 20000);
  document.addEventListener("orbita-place", refresh);
  return { refresh };
})();
