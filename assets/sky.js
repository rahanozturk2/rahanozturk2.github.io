/*
  Atmosphere: a small, divergence-free flow built from a stream function.
  Lows (cyclonic, counter-clockwise) and highs drift slowly; a meandering jet
  crosses the page; the mean flow follows the current wind in Istanbul.
  Isobars are contours of the same field, so the wind runs along them.
  Inspired by Viégas & Wattenberg's Wind Map.
*/
(() => {
  const cv = document.getElementById('sky');
  const ctx = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const TRAIL = 22, SAMPLE = 1 / 30;
  let sampleAcc = 0;
  let W, H, L, dpr, parts, vortices, t = 0;
  const mean = { u: 14, v: -4, target: { u: 14, v: -4 } };
  const jet = { y: .26, a: .05, k: 2.2, w: .07, A: 26, ph: 0 };
  const mouse = { x: -1e4, y: -1e4, s: 0 };

  const rnd = (a, b) => a + Math.random() * (b - a);

  function makeVortices() {
    const spec = [
      { x: .62, y: .55, r: .22, c: 120 },   // deep low
      { x: .30, y: .80, r: .18, c: -80 },   // high
      { x: .88, y: .22, r: .16, c: 90 },    // low
      { x: .15, y: .30, r: .20, c: -70 },   // high
      { x: .80, y: .88, r: .13, c: 70 },    // small low, an eddy
      { x: .45, y: .15, r: .12, c: -55 },
    ];
    return spec.map(s => ({ x: s.x * W, y: s.y * H, r: s.r * L, c: s.c, c0: s.c,
      dx: rnd(-3, 3), dy: rnd(-2, 2), p: rnd(0, 6.28) }));
  }

  // Velocity from psi: u = dpsi/dy, v = -dpsi/dx (screen y points down,
  // so positive c turns counter-clockwise on screen, like a northern low).
  function vel(x, y) {
    let u = mean.u, v = mean.v;
    for (let i = 0; i < vortices.length; i++) {
      const o = vortices[i], dx = x - o.x, dy = y - o.y;
      const e = Math.exp(-(dx * dx + dy * dy) / (2 * o.r * o.r)) * o.c / o.r;
      u += e * dy; v -= e * dx;
    }
    const s = jet.k * x / L + jet.ph;
    const eta = (y - jet.y * H - jet.a * L * Math.sin(s)) / (jet.w * L);
    const ch = Math.cosh(eta), sech2 = 1 / (ch * ch);
    u += jet.A * sech2;
    v += jet.A * sech2 * jet.a * jet.k * Math.cos(s);
    if (mouse.s > .01) {
      const dx = x - mouse.x, dy = y - mouse.y, r = 110;
      const e = Math.exp(-(dx * dx + dy * dy) / (2 * r * r)) * 160 * mouse.s / r;
      u += e * dy; v -= e * dx;
    }
    return [u, v];
  }

  // The same stream function, used as pressure for isobars and H/L labels.
  function psi(x, y) {
    let p = mean.u * y - mean.v * x;
    for (let i = 0; i < vortices.length; i++) {
      const o = vortices[i], dx = x - o.x, dy = y - o.y;
      p -= o.c * o.r * Math.exp(-(dx * dx + dy * dy) / (2 * o.r * o.r));
    }
    const s = jet.k * x / L + jet.ph;
    p += jet.A * jet.w * L * Math.tanh((y - jet.y * H - jet.a * L * Math.sin(s)) / (jet.w * L));
    return p;
  }

  function spawn(p, i) {
    const x = Math.random() * W, y = Math.random() * H;
    for (let k = 0; k < TRAIL; k++) { p.xs[k] = x; p.ys[k] = y; }
    p.age = 0; p.life = rnd(60, 150) | 0; p.wine = i % 11 === 0;
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight; L = Math.min(W, H) * .9 + Math.max(W, H) * .1;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vortices = makeVortices();
    const mr = mainEl.getBoundingClientRect(), cs = getComputedStyle(mainEl);
    textCol = W < 860 ? [-1, W + 1] : [mr.left + parseFloat(cs.paddingLeft) - 40, mr.right - parseFloat(cs.paddingRight) + 40];
    const n = Math.min(1700, Math.round(W * H / (W < 700 ? 1500 : 1300)));
    parts = Array.from({ length: n }, (_, i) => {
      const p = { xs: new Float32Array(TRAIL), ys: new Float32Array(TRAIL) };
      spawn(p, i); p.age = rnd(0, p.life) | 0; return p;
    });
  }

  // The head moves every frame; the trail takes a new sample at a fixed rate.
  function stepParticles(dt) {
    sampleAcc += dt;
    const shift = sampleAcc >= SAMPLE;
    if (shift) sampleAcc %= SAMPLE;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (shift) {
        for (let k = TRAIL - 1; k > 0; k--) { p.xs[k] = p.xs[k - 1]; p.ys[k] = p.ys[k - 1]; }
        if (++p.age > p.life) { spawn(p, i); continue; }
      }
      const [u, v] = vel(p.xs[0], p.ys[0]);
      p.xs[0] += u * dt; p.ys[0] += v * dt;
      if (p.xs[0] < -20 || p.xs[0] > W + 20 || p.ys[0] < -20 || p.ys[0] > H + 20) spawn(p, i);
    }
  }

  function stepField(dt) {
    t += dt;
    jet.ph += dt * .035;
    mean.u += (mean.target.u - mean.u) * Math.min(1, dt * .4);
    mean.v += (mean.target.v - mean.v) * Math.min(1, dt * .4);
    for (const o of vortices) {
      o.x += (o.dx + mean.u * .25) * dt; o.y += (o.dy + mean.v * .25) * dt;
      o.c = o.c0 * (1 + .25 * Math.sin(t * .15 + o.p));
      const m = o.r * 1.5;
      if (o.x > W + m) o.x = -m; if (o.x < -m) o.x = W + m;
      if (o.y > H + m) o.y = -m; if (o.y < -m) o.y = H + m;
    }
    mouse.s *= Math.pow(.35, dt);
  }

  // Isobars by marching squares over psi.
  const LEVELS = 16;
  function drawIsobars() {
    const g = W < 700 ? 22 : 18, cols = Math.ceil(W / g) + 1, rows = Math.ceil(H / g) + 1;
    const f = new Float32Array(cols * rows);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const val = psi(i * g, j * g); f[j * cols + i] = val;
      if (val < lo) lo = val; if (val > hi) hi = val;
    }
    const step = (hi - lo) / LEVELS;
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = f[j * cols + i], b = f[j * cols + i + 1], c = f[(j + 1) * cols + i + 1], d = f[(j + 1) * cols + i];
      const mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d);
      const x = i * g, y = j * g;
      for (let lv = Math.ceil((mn - lo) / step) * step + lo; lv < mx; lv += step) {
        const pts = [];
        if ((a < lv) !== (b < lv)) pts.push(x + g * (lv - a) / (b - a), y);
        if ((b < lv) !== (c < lv)) pts.push(x + g, y + g * (lv - b) / (c - b));
        if ((d < lv) !== (c < lv)) pts.push(x + g * (lv - d) / (c - d), y + g);
        if ((a < lv) !== (d < lv)) pts.push(x, y + g * (lv - a) / (d - a));
        if (pts.length >= 4) { ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); }
        if (pts.length === 8) { ctx.moveTo(pts[4], pts[5]); ctx.lineTo(pts[6], pts[7]); }
      }
    }
    ctx.strokeStyle = 'rgba(236,232,226,.075)';
    ctx.lineWidth = 1;
    ctx.stroke();
    return { lo, hi };
  }

  const mainEl = document.querySelector('main');
  let textCol = [0, 0];
  function drawLabels(range) {
    ctx.textAlign = 'center';
    for (const o of vortices) {
      if (o.x < 30 || o.x > W - 30 || o.y < 30 || o.y > H - 30) continue;
      if (o.x > textCol[0] && o.x < textCol[1]) continue;
      const low = o.c0 > 0;
      const hpa = Math.round(1013 + 22 * ((psi(o.x, o.y) - range.lo) / (range.hi - range.lo) - .5));
      ctx.fillStyle = low ? 'rgba(180,96,107,.55)' : 'rgba(236,232,226,.28)';
      ctx.font = 'italic 300 26px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(low ? 'L' : 'H', o.x, o.y + 6);
      ctx.fillStyle = 'rgba(236,232,226,.22)';
      ctx.font = '400 9px "Geist Mono", ui-monospace, monospace';
      ctx.fillText(hpa, o.x, o.y + 22);
    }
  }

  // Trails drawn in alpha groups, head bright and tail fading; one stroke per group.
  const GROUPS = 5;
  function drawParticles() {
    ctx.lineCap = 'round';
    const per = (TRAIL - 1) / GROUPS;
    for (let pass = 0; pass < 2; pass++) {
      const wine = pass === 1;
      for (let gi = 0; gi < GROUPS; gi++) {
        const k0 = Math.floor(gi * per), k1 = Math.floor((gi + 1) * per);
        ctx.beginPath();
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (p.wine !== wine || p.age < 2) continue;
          ctx.moveTo(p.xs[k0], p.ys[k0]);
          for (let k = k0 + 1; k <= k1; k++) ctx.lineTo(p.xs[k], p.ys[k]);
        }
        const a = Math.pow(1 - gi / GROUPS, 1.4) * (wine ? .5 : .3);
        ctx.strokeStyle = wine ? `rgba(180,74,88,${a})` : `rgba(236,232,226,${a})`;
        ctx.lineWidth = wine ? 1.1 : .8;
        ctx.stroke();
      }
    }
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    const range = drawIsobars();
    drawParticles();
    drawLabels(range);
  }

  let last = 0;
  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    stepField(dt);
    stepParticles(dt);
    frame();
    requestAnimationFrame(loop);
  }

  function renderStill() {
    for (let s = 0; s < TRAIL + 40; s++) stepParticles(SAMPLE);
    frame();
  }

  resize();
  addEventListener('resize', () => { resize(); if (still) renderStill(); });
  if (fine && !still) addEventListener('pointermove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.s = Math.min(1, mouse.s + .08);
  }, { passive: true });

  if (still) document.fonts.ready.then(renderStill);
  else requestAnimationFrame(t0 => { last = t0; requestAnimationFrame(loop); });

  // Current weather in Istanbul steers the mean flow.
  const WX = { 0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'rime fog',
    51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'rain showers', 81: 'rain showers',
    82: 'violent showers', 85: 'snow showers', 86: 'snow showers', 95: 'thunderstorm', 96: 'thunderstorm, hail', 99: 'thunderstorm, hail' };
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  fetch('https://api.open-meteo.com/v1/forecast?latitude=41.01&longitude=28.98&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code&timezone=Europe%2FIstanbul')
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => {
      const c = d.current, from = c.wind_direction_10m, ws = c.wind_speed_10m;
      const to = (from + 180) * Math.PI / 180, mag = Math.max(8, Math.min(40, 6 + ws * 1.3));
      mean.target = { u: Math.sin(to) * mag, v: -Math.cos(to) * mag };
      const el = document.getElementById('now'), credit = document.getElementById('credit');
      if (!el) return;
      el.innerHTML = `Istanbul, now<br><b>${Math.round(c.temperature_2m)}°C</b> · ${WX[c.weather_code] || '—'}<br>` +
        `wind <span class="arrow" style="transform:rotate(${from + 180}deg)">↑</span> ${DIRS[Math.round(from / 45) % 8]} ${Math.round(ws)} km/h`;
      el.classList.add('on');
      if (credit) credit.textContent = "Background: a pressure field steered by today's wind in Istanbul.";
    })
    .catch(() => {});
})();
