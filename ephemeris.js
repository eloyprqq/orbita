/* Sun, Moon, and planet positions.
   JPL Horizons does not send browser CORS headers, so this uses
   Astronomy Engine locally (MIT, Don Cross). Stars stay in catalog.js. */
const OrbitaEphemeris = (() => {
  const SPECS = [
    ["Sun", "sun"],
    ["Moon", "moon"],
    ["Venus", "planet"],
    ["Mars", "planet"],
    ["Jupiter", "planet"],
    ["Saturn", "planet"],
  ];
  let cacheKey = "";
  let cacheList = null;

  function bodies(date, lat, lon) {
    if (typeof Astronomy === "undefined" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const key = `${lat.toFixed(3)}|${lon.toFixed(3)}|${Math.floor(date.getTime() / 10000)}`;
    if (key === cacheKey && cacheList) return cacheList;
    try {
      const observer = new Astronomy.Observer(lat, lon, 0);
      const list = SPECS.map(([name, kind]) => {
        const body = Astronomy.Body[name];
        const eq = Astronomy.Equator(body, date, observer, true, true);
        const illum = Astronomy.Illumination(body, date);
        let mag = illum.mag;
        if (!Number.isFinite(mag)) mag = name === "Sun" ? -26.74 : name === "Moon" ? -12 : 0;
        return {
          name,
          ra: eq.ra,
          dec: eq.dec,
          mag,
          kind,
          illum: illum.phase_fraction,
          source: "astronomy-engine",
        };
      });
      cacheKey = key;
      cacheList = list;
      return list;
    } catch (_) {
      return null;
    }
  }

  return {
    bodies,
    ready: () => typeof Astronomy !== "undefined",
  };
})();
