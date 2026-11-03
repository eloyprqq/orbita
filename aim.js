/* Screen-relative arrows. Left means the left side of this display, not west. */
const OrbitaAim = (() => {
  const root = document.getElementById("aim");
  const arrow = document.getElementById("aim-arrow");
  const caption = document.getElementById("aim-caption");
  let pin = null;
  let lastSelected = null;

  const BASIC = [
    ["북극성", "star:Polaris"],
    ["시리우스", "star:Sirius"],
    ["베가", "star:Vega"],
    ["베텔게우스", "star:Betelgeuse"],
    ["카펠라", "star:Capella"],
    ["달", "moon:Moon"],
    ["금성", "planet:Venus"],
    ["안드로메다", "dso:Andromeda Galaxy"],
  ];

  function pinTarget(next) {
    pin = next;
    markPicks();
  }

  function resolve(target) {
    if (!target) return null;
    if (!target.moving) return target;
    const body = Sky.bodiesAt(Sky.now()).find((item) => item.name === target.body);
    if (!body) return target;
    return { name: target.name, ra: body.ra, dec: body.dec };
  }

  function current() {
    const guide = Sky.getGuide();
    const step = guide?.steps?.[guide.index];
    if (step) return { name: step.name, ra: step.ra, dec: step.dec };
    const selected = Sky.getSelected();
    if (selected && selected !== lastSelected && selected.ra != null) {
      lastSelected = selected;
      pin = {
        name: selected.name,
        ra: selected.ra,
        dec: selected.dec,
        moving: selected.kind === "planet" || selected.kind === "moon",
        body: selected.name,
      };
    }
    return resolve(pin);
  }

  function phrase(horizontal, vertical, off) {
    const side = [vertical, horizontal].filter(Boolean).join(" ");
    if (!side) return "화면 가운데에 있어요";
    if (off) return `화면 ${side} 밖에 있어요. 그쪽으로 하늘을 돌려 보세요.`;
    return `화면 ${side}에 있어요`;
  }

  function tick() {
    const basic = document.documentElement.dataset.mode !== "expert";
    const target = current();
    if (!target || target.ra == null) {
      root.hidden = !basic;
      arrow.hidden = true;
      caption.textContent = basic ? "찾을 별을 고르면 화면의 어느 쪽인지 화살표로 알려 줍니다." : "";
      requestAnimationFrame(tick);
      return;
    }
    if (!Sky.isLocated()) {
      root.hidden = false;
      arrow.hidden = true;
      caption.textContent = "위치를 허용해야 이 화면 기준으로 방향을 알려 줍니다.";
      requestAnimationFrame(tick);
      return;
    }
    const aim = Sky.screenAim(target.ra, target.dec);
    root.hidden = false;
    const name = target.name;
    if (aim.below && (aim.forward <= 0.04 || !aim.onScreen)) {
      arrow.hidden = true;
      caption.textContent = `${name}, 지금은 지평선 아래라 화면에 없어요.`;
      requestAnimationFrame(tick);
      return;
    }
    const cx = aim.w / 2;
    const cy = aim.h / 2;
    const dx = aim.x == null ? aim.right : aim.x - cx;
    const dy = aim.x == null ? -aim.up : aim.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const dead = Math.min(aim.w, aim.h) * 0.12;
    const onCenter = aim.onScreen && dist < dead;
    if (onCenter) {
      arrow.hidden = true;
      caption.textContent = `${name}, 화면 가운데에 있어요`;
      requestAnimationFrame(tick);
      return;
    }
    const nx = dx / dist;
    const ny = dy / dist;
    let horizontal = "";
    let vertical = "";
    if (Math.abs(nx) > 0.34) horizontal = nx < 0 ? "왼쪽" : "오른쪽";
    if (Math.abs(ny) > 0.34) vertical = ny < 0 ? "위" : "아래";
    if (!horizontal && !vertical) horizontal = nx < 0 ? "왼쪽" : "오른쪽";
    const off = !aim.onScreen;
    arrow.hidden = false;
    const reach = Math.min(aim.w, aim.h) * (basic ? 0.34 : 0.28);
    const ax = Math.max(56, Math.min(aim.w - 56, cx + nx * reach));
    const ay = Math.max(108, Math.min(aim.h - 128, cy + ny * reach));
    arrow.style.left = `${ax}px`;
    arrow.style.top = `${ay}px`;
    arrow.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(ny, nx)}rad)`;
    caption.textContent = `${name}, ${phrase(horizontal, vertical, off)}`;
    requestAnimationFrame(tick);
  }

  function markPicks() {
    document.querySelectorAll("#basic-picks button").forEach((btn) => {
      btn.classList.toggle("on", pin && btn.dataset.id === pin.id);
    });
  }

  function buildPicks() {
    const box = document.getElementById("basic-picks");
    if (!box || typeof OrbitaEngine === "undefined") return;
    box.innerHTML = BASIC.map(([label, id]) => `<button type="button" data-id="${id}">${label}</button>`).join("");
    box.addEventListener("click", (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;
      const found = OrbitaEngine.targetById(btn.dataset.id);
      if (!found) return;
      pinTarget({
        id: found.id,
        name: btn.textContent.trim(),
        ra: found.ra,
        dec: found.dec,
        moving: !!found.moving,
        body: found.name,
      });
      Sky.setGuide(null);
    });
  }

  buildPicks();
  requestAnimationFrame(tick);

  return { pin: pinTarget };
})();
