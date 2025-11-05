// script.js
window.addEventListener("DOMContentLoaded", () => {
  const base = document.getElementById("canvas");                // cloud layer (points)
  const cloud = base.getContext("2d", { alpha: false, desynchronized: true });

  const countInput = document.getElementById("count");
  const startBtn   = document.getElementById("start");
  const resetBtn   = document.getElementById("reset");
  const settingsBar = document.querySelector(".setting");
  const game = document.querySelector(".game");

  // Make the game container a positioning context for the overlay
  if (game) game.style.position = "relative";

  // Create overlay canvas for HUD (vertices + seed marker)
  const hudCanvas = document.createElement("canvas");
  hudCanvas.id = "hud-canvas";
  hudCanvas.style.position = "absolute";
  hudCanvas.style.top = "0";
  hudCanvas.style.left = "0";
  hudCanvas.style.zIndex = "2";
  game.appendChild(hudCanvas);
  const hud = hudCanvas.getContext("2d");

  // --- Inject speed control (dots per second) ---
  const speedWrap = document.createElement("div");
  speedWrap.style.display = "flex";
  speedWrap.style.alignItems = "center";
  speedWrap.style.gap = "6px";

  const speedLabel = document.createElement("label");
  speedLabel.textContent = "Speed";
  speedLabel.style.fontSize = "12px";

  const speed = document.createElement("input");
  speed.type = "range";
  speed.min = "5";         // 5 dots/sec minimum
  speed.max = "50000";     // feel free to increase
  speed.step = "1";
  speed.value = "2000";
  speed.style.width = "160px";

  const speedVal = document.createElement("span");
  speedVal.style.fontSize = "12px";

  speedWrap.appendChild(speedLabel);
  speedWrap.appendChild(speed);
  speedWrap.appendChild(speedVal);
  settingsBar.appendChild(speedWrap);

  const fmt = (n) => Number(n).toLocaleString();

  // --- State ---
  let running = false;
  let vertices = [];
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  const vertexRadius = 8;
  const seedRadius = 6;

  // Bigger dots for the attractor
  const POINT_SIZE = 5; // increase to 3 for chunkier points

  const JUMP = 0.5;

  // Fixed seed marker (blue dot) — NEVER moves unless user drags it
  let seedMarker = { x: 0, y: 0 };

  // Internal current point used for plotting; this moves during the chaos game
  let curr = { x: 0, y: 0 };

  let draggingVertexIndex = -1;
  let draggingSeed = false;
  let dragWasRunning = false;

  // time-based stepping (dots per second)
  let desiredDPS = parseInt(speed.value, 10);
  let carry = 0;
  let lastTime = performance.now();

  function updateSpeedLabel() {
    speedVal.textContent = `${fmt(desiredDPS)} dps`;
  }
  updateSpeedLabel();

  speed.addEventListener("input", () => {
    desiredDPS = Math.max(5, parseInt(speed.value, 10) || 5);
    updateSpeedLabel();
  });

  // --- Helpers ---
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function cssSize() {
    const barH = settingsBar ? settingsBar.getBoundingClientRect().height : 0;
    return { width: window.innerWidth, height: Math.max(0, window.innerHeight - barH) };
  }

  function setCanvasSize(cvs, ctx, w, h) {
    // handle DPR scaling so all drawing uses CSS pixels
    cvs.style.width = `${w}px`;
    cvs.style.height = `${h}px`;
    cvs.width = Math.floor(w * dpr);
    cvs.height = Math.floor(h * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  function resizeAll() {
    const { width, height } = cssSize();
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));

    const oldCssW = base.width / dpr || w;
    const oldCssH = base.height / dpr || h;

    dpr = Math.max(1, window.devicePixelRatio || 1);

    // Base (cloud) and HUD must match sizes exactly
    setCanvasSize(base, cloud, w, h);
    setCanvasSize(hudCanvas, hud, w, h);

    // Scale positions to new size
    const sx = w / oldCssW;
    const sy = h / oldCssH;
    if (isFinite(sx) && isFinite(sy) && oldCssW && oldCssH) {
      vertices = vertices.map(v => ({ x: v.x * sx, y: v.y * sy }));
      seedMarker.x *= sx; seedMarker.y *= sy;
      curr.x *= sx; curr.y *= sy;
    }

    redrawAll(); // full redraw after resize
  }

  function clearCloud() {
    const { width, height } = cssSize();
    cloud.fillStyle = "#fff";
    cloud.fillRect(0, 0, width, height);
  }

  function clearHUD() {
    const { width, height } = cssSize();
    hud.clearRect(0, 0, width, height);
  }

  function initVertices(n) {
    const { width, height } = cssSize();
    const cx = width / 2, cy = height / 2;
    const radius = Math.min(width, height) * 0.40;
    const startAngle = Math.random() * Math.PI * 2;

    vertices = [];
    for (let i = 0; i < n; i++) {
      const a = startAngle + (i * 2 * Math.PI) / n;
      vertices.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
    }
  }

  // --- Drawing (HUD) ---
  function drawVertex(v) {
    hud.beginPath();
    hud.arc(v.x, v.y, vertexRadius, 0, Math.PI * 2);
    hud.fillStyle = "#e53935";
    hud.fill();
    // No labels
  }

  function drawHUD() {
    clearHUD();

    // polygon edges
    if (vertices.length >= 2) {
      hud.beginPath();
      hud.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) hud.lineTo(vertices[i].x, vertices[i].y);
      hud.closePath();
      hud.lineWidth = 1;
      hud.strokeStyle = "rgba(0,0,0,0.2)";
      hud.stroke();
    }

    // vertices (no labels)
    for (let i = 0; i < vertices.length; i++) drawVertex(vertices[i]);

    // seed marker (blue) — fixed
    hud.beginPath();
    hud.arc(seedMarker.x, seedMarker.y, seedRadius, 0, Math.PI * 2);
    hud.fillStyle = "#1e88e5";
    hud.fill();
  }

  function redrawAll() {
    drawHUD(); // cloud remains unless we explicitly clearCloud()
  }

  // --- Cloud plotting ---
  function plotPoint(x, y) {
    cloud.fillStyle = "#000";
    cloud.fillRect(x, y, POINT_SIZE, POINT_SIZE);
  }

  function stepOnce() {
    const v = vertices[(Math.random() * vertices.length) | 0];
    curr.x = curr.x * (1 - JUMP) + v.x * JUMP;
    curr.y = curr.y * (1 - JUMP) + v.y * JUMP;
    plotPoint(curr.x, curr.y);
  }

  function animate(now) {
    if (!running) return;
    const dt = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;

    carry += desiredDPS * dt;
    const n = Math.min(200000, Math.floor(carry)); // safety cap
    if (n > 0) {
      for (let i = 0; i < n; i++) stepOnce();
      carry -= n;
    }
    requestAnimationFrame(animate);
  }

  // --- Controls ---
  const getCount = () => {
    const n = parseInt((countInput.value || "").trim(), 10);
    return clamp(Number.isFinite(n) ? n : 3, 3, 20);
  };

  function start() {
    if (running) return;
    running = true;
    startBtn.textContent = "Pause";
    lastTime = performance.now();
    requestAnimationFrame(animate);
  }

  function pause() {
    running = false;
    startBtn.textContent = "Start";
  }

  function reset(withNewCount = true) {
    pause();
    if (withNewCount) initVertices(getCount());

    // Do NOT change the seed marker. Restart the walk from the marker.
    curr = { ...seedMarker };

    carry = 0;
    clearCloud(); // clear only the points
    redrawAll();  // redraw HUD with the same seed marker
  }

  // --- Pointer interactions (attach to HUD so hits are clean) ---
  function eventToCanvasPos(e) {
    const rect = hudCanvas.getBoundingClientRect();
    const x = (e.clientX ?? (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY ?? (e.touches && e.touches[0].clientY)) - rect.top;
    return { x, y };
  }

  // Prioritize vertex hits to avoid accidental seed drags if overlapping
  function hitTestVertex(p) {
    const r = vertexRadius + 8; // larger grab radius
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const dx = v.x - p.x, dy = v.y - p.y;
      if (dx * dx + dy * dy <= r * r) return i;
    }
    return -1;
  }

  function hitTestSeed(p) {
    const r = seedRadius + 4; // tighter than vertex
    const dx = seedMarker.x - p.x, dy = seedMarker.y - p.y;
    return dx * dx + dy * dy <= r * r;
  }

  function pointerDown(e) {
    const p = eventToCanvasPos(e);

    // Vertex first
    const vi = hitTestVertex(p);
    if (vi >= 0) {
      draggingVertexIndex = vi;
      dragWasRunning = running;
      pause();
      hudCanvas.setPointerCapture?.(e.pointerId ?? 1);
      e.preventDefault();
      return;
    }

    // Then seed marker
    if (hitTestSeed(p)) {
      draggingSeed = true;
      dragWasRunning = running;
      pause();
      hudCanvas.setPointerCapture?.(e.pointerId ?? 1);
      e.preventDefault();
      return;
    }
  }

  function pointerMove(e) {
    const p = eventToCanvasPos(e);

    if (draggingSeed) {
      // Move ONLY the marker; curr (the walker) is untouched until we release
      seedMarker.x = p.x; seedMarker.y = p.y;
      drawHUD(); // just overlay
      return;
    }

    if (draggingVertexIndex >= 0) {
      vertices[draggingVertexIndex].x = p.x;
      vertices[draggingVertexIndex].y = p.y;

      // Geometry changed: clear cloud and redraw; walker will restart from marker on release
      clearCloud();
      drawHUD();
      return;
    }
  }

  function pointerUp(e) {
    if (draggingSeed) {
      draggingSeed = false;
      hudCanvas.releasePointerCapture?.(e.pointerId ?? 1);

      // When user finishes moving the seed, restart the walk FROM the marker
      curr = { ...seedMarker };
      carry = 0;

      if (dragWasRunning) start();
      return;
    }

    if (draggingVertexIndex >= 0) {
      draggingVertexIndex = -1;
      hudCanvas.releasePointerCapture?.(e.pointerId ?? 1);

      // After moving a vertex, restart the walk FROM the marker
      curr = { ...seedMarker };
      carry = 0;

      if (dragWasRunning) start();
    }
  }

  // --- Wire up ---
  window.addEventListener("resize", resizeAll);
  hudCanvas.addEventListener("pointerdown", pointerDown);
  hudCanvas.addEventListener("pointermove", pointerMove);
  hudCanvas.addEventListener("pointerup", pointerUp);
  hudCanvas.addEventListener("pointercancel", pointerUp);
  hudCanvas.addEventListener("pointerleave", pointerUp);

  startBtn.addEventListener("click", () => (running ? pause() : start()));
  resetBtn.addEventListener("click", () => reset(true));
  countInput.addEventListener("keydown", (e) => { if (e.key === "Enter") reset(true); });
  countInput.addEventListener("blur", () => reset(true));

  // --- Boot ---
  if (!countInput.value.trim()) countInput.value = "3";
  resizeAll();
  initVertices(getCount());

  const { width, height } = cssSize();
  seedMarker.x = width / 2;
  seedMarker.y = height / 2;

  // Start the walker at the seed marker (but the marker itself never moves)
  curr = { ...seedMarker };

  clearCloud();
  drawHUD();
});
