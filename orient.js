/* Point the sky where the back of the screen points.
   Phone planetarium apps do this with the same deviceorientation angles.
   A laptop only follows for real when the browser exposes those sensors. */
const OrbitaOrient = (() => {
  const btn = document.getElementById("orient-btn");
  const note = document.getElementById("orient-note");
  const DIR = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];

  let running = false;
  let mode = "off";
  let offset = 0;
  let calibrated = false;
  let fusedAlpha = 0;
  let lastMotion = 0;
  let latest = { beta: 90, gamma: 0 };
  let sensor = null;
  let noteDir = "";

  function lookFrom(alphaDeg, betaDeg, gammaDeg) {
    const d = Math.PI / 180;
    const x = (betaDeg || 0) * d;
    const y = (gammaDeg || 0) * d;
    const z = (alphaDeg || 0) * d;
    const cX = Math.cos(x);
    const cY = Math.cos(y);
    const cZ = Math.cos(z);
    const sX = Math.sin(x);
    const sY = Math.sin(y);
    const sZ = Math.sin(z);
    const east = -(cY * sZ * sX + cZ * sY);
    const north = -(sZ * sY - cZ * cY * sX);
    const up = -(cX * cY);
    const alt = Math.asin(Math.max(-1, Math.min(1, up)));
    const az = Math.atan2(east, north);
    return { alt, az };
  }

  function lookFromQuat(q) {
    const x = q[0];
    const y = q[1];
    const z = q[2];
    const w = q[3];
    const vx = 0;
    const vy = 0;
    const vz = -1;
    const tx = 2 * (y * vz - z * vy);
    const ty = 2 * (z * vx - x * vz);
    const tz = 2 * (x * vy - y * vx);
    const east = vx + w * tx + (y * tz - z * ty);
    const north = vy + w * ty + (z * tx - x * tz);
    const up = vz + w * tz + (x * ty - y * tx);
    const alt = Math.asin(Math.max(-1, Math.min(1, up)));
    const az = Math.atan2(east, north);
    return { alt, az };
  }

  function dirText() {
    return DIR[Math.round(Sky.headingDeg() / 45) % 8];
  }

  function paint(text) {
    if (note) note.textContent = text;
    if (btn) btn.setAttribute("aria-pressed", running ? "true" : "false");
    if (btn) btn.classList.toggle("on", running);
  }

  function describe() {
    const dir = dirText();
    if (dir === noteDir && mode !== "off") return;
    noteDir = dir;
    if (mode === "absolute") paint(`화면 뒷면이 ${dir}쪽 하늘을 향합니다.`);
    else if (mode === "relative") paint(`나침반은 없습니다. 켠 뒤의 기울기와 회전만 따라가며, 지금은 ${dir}쪽입니다.`);
    else if (mode === "tilt") paint("기울기만 읽을 수 있습니다. 좌우로 도는 방향은 이 노트북에서 오지 않습니다.");
    else paint("화면 뒷면이 향한 하늘을 따라갑니다.");
  }

  function applyLook(look, absolute) {
    if (Sky.isDragging()) return;
    if (mode === "tilt") {
      Sky.applyLook(Sky.state.az, look.alt);
      return;
    }
    if (!absolute) {
      if (!calibrated) {
        offset = Sky.state.az - look.az;
        calibrated = true;
      }
      Sky.applyLook(look.az + offset, look.alt);
      return;
    }
    Sky.applyLook(look.az, look.alt);
  }

  function onOrientation(event) {
    if (!running || sensor) return;
    const beta = event.beta;
    const gamma = event.gamma;
    if (beta == null || gamma == null) return;
    latest = { beta, gamma };
    const absolute = event.absolute === true || event.type === "deviceorientationabsolute";
    if (event.alpha == null) {
      if (mode === "off") mode = "tilt";
      if (mode === "tilt") applyLook(lookFrom(fusedAlpha, beta, gamma), false);
      describe();
      return;
    }
    mode = absolute ? "absolute" : mode === "absolute" ? "absolute" : "relative";
    applyLook(lookFrom(event.alpha, beta, gamma), mode === "absolute");
    describe();
  }

  function onMotion(event) {
    if (!running || sensor || mode === "absolute") return;
    const rate = event.rotationRate;
    if (!rate || rate.alpha == null) return;
    const now = performance.now();
    const dt = lastMotion ? Math.min(0.1, (now - lastMotion) / 1000) : 0;
    lastMotion = now;
    const b = (latest.beta || 0) * Math.PI / 180;
    const g = (latest.gamma || 0) * Math.PI / 180;
    const wx = ((rate.beta || 0) * Math.PI) / 180;
    const wy = ((rate.gamma || 0) * Math.PI) / 180;
    const wz = ((rate.alpha || 0) * Math.PI) / 180;
    const upX = -Math.cos(b) * Math.sin(g);
    const upY = Math.sin(b);
    const upZ = Math.cos(b) * Math.cos(g);
    fusedAlpha += ((wx * upX + wy * upY + wz * upZ) * 180) / Math.PI * dt;
    if (mode !== "absolute") mode = "relative";
    applyLook(lookFrom(fusedAlpha, latest.beta, latest.gamma), false);
    describe();
  }

  function onSensor() {
    if (!running || !sensor) return;
    const look = lookFromQuat(sensor.quaternion);
    mode = sensor instanceof AbsoluteOrientationSensor ? "absolute" : "relative";
    applyLook(look, mode === "absolute");
    describe();
  }

  function stopSensor() {
    if (!sensor) return;
    try {
      sensor.stop();
    } catch (_) {
      /* already stopped */
    }
    sensor.removeEventListener("reading", onSensor);
    sensor = null;
  }

  function unlisten() {
    window.removeEventListener("deviceorientationabsolute", onOrientation);
    window.removeEventListener("deviceorientation", onOrientation);
    window.removeEventListener("devicemotion", onMotion);
    stopSensor();
  }

  async function askPermission() {
    const asks = [];
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      asks.push(DeviceOrientationEvent.requestPermission());
    }
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      asks.push(DeviceMotionEvent.requestPermission());
    }
    if (!asks.length) return true;
    try {
      const results = await Promise.all(asks);
      return results.every((item) => item === "granted");
    } catch (_) {
      return false;
    }
  }

  function startSensor(kind) {
    const Ctor = kind === "absolute" ? window.AbsoluteOrientationSensor : window.RelativeOrientationSensor;
    if (typeof Ctor !== "function") return Promise.resolve(false);
    let next;
    try {
      next = new Ctor({ frequency: 30 });
    } catch (_) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        if (!ok) {
          try {
            next.stop();
          } catch (_) {
            /* ignore */
          }
          next.removeEventListener("reading", okReading);
          next.removeEventListener("error", bad);
        }
        resolve(ok);
      };
      const okReading = () => {
        if (settled) return;
        sensor = next;
        finish(true);
      };
      const bad = () => finish(false);
      next.addEventListener("reading", okReading);
      next.addEventListener("error", bad);
      try {
        next.start();
      } catch (_) {
        finish(false);
        return;
      }
      setTimeout(() => finish(false), 1200);
    });
  }

  function waitForEvents() {
    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("deviceorientationabsolute", mark);
        window.removeEventListener("deviceorientation", mark);
        resolve(value);
      };
      const mark = (event) => {
        if (event.beta == null) return;
        if (event.alpha == null) done("tilt");
        else done(event.absolute || event.type === "deviceorientationabsolute" ? "absolute" : "relative");
      };
      window.addEventListener("deviceorientationabsolute", mark);
      window.addEventListener("deviceorientation", mark);
      setTimeout(() => done(null), 1600);
    });
  }

  async function enable() {
    if (running) {
      disable();
      return;
    }
    running = true;
    mode = "off";
    calibrated = false;
    fusedAlpha = 0;
    lastMotion = 0;
    noteDir = "";
    paint("방향 센서를 확인하는 중…");
    const allowed = await askPermission();
    if (!running) return;
    if (!allowed) {
      running = false;
      paint("브라우저가 방향 센서를 막았습니다. 하늘을 끌어 보세요.");
      return;
    }
    if (await startSensor("absolute")) {
      mode = "absolute";
      sensor.addEventListener("reading", onSensor);
      paint("나침반으로 화면 뒷면의 하늘을 맞추는 중…");
      return;
    }
    if (!running) return;
    if (await startSensor("relative")) {
      mode = "relative";
      calibrated = false;
      sensor.addEventListener("reading", onSensor);
      paint("나침반은 없습니다. 켠 순간부터의 기울기와 회전을 따라갑니다.");
      return;
    }
    if (!running) return;
    const found = await waitForEvents();
    if (!running) return;
    if (!found) {
      running = false;
      paint("이 브라우저는 노트북 방향 센서를 주지 않습니다. 하늘을 끌어 방향을 맞추세요.");
      return;
    }
    mode = found === "absolute" ? "absolute" : found === "relative" ? "relative" : "tilt";
    calibrated = false;
    window.addEventListener("deviceorientationabsolute", onOrientation);
    window.addEventListener("deviceorientation", onOrientation);
    window.addEventListener("devicemotion", onMotion);
    describe();
  }

  function disable() {
    running = false;
    mode = "off";
    noteDir = "";
    unlisten();
    paint("화면 뒷면이 향한 하늘을 따라갑니다.");
  }

  if (btn) btn.addEventListener("click", () => enable());

  return {
    enable,
    disable,
    preview(alpha, beta, gamma) {
      const look = lookFrom(alpha, beta, gamma);
      return {
        altDeg: (look.alt * 180) / Math.PI,
        azDeg: ((look.az * 180) / Math.PI + 360) % 360,
      };
    },
    feed(alpha, beta, gamma, absolute) {
      mode = absolute ? "absolute" : "relative";
      applyLook(lookFrom(alpha, beta, gamma), !!absolute);
      return { alt: Sky.state.alt, az: Sky.headingDeg(), mode };
    },
  };
})();
