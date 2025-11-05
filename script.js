window.addEventListener("DOMContentLoaded", () => {
  const base = document.getElementById("canvas");
  const cloud = base.getContext("2d", { alpha: false, desynchronized: true });

  const countInput = document.getElementById("count");
  const startBtn   = document.getElementById("start");
  const resetBtn   = document.getElementById("reset");
  const settingsBar = document.querySelector(".setting");
  const game = document.querySelector(".game");

  if (game) game.style.position = "relative";

  const hudCanvas = document.createElement("canvas");
  hudCanvas.id = "hud-canvas";
  hudCanvas.style.position = "absolute";
  hudCanvas.style.top = "0";
  hudCanvas.style.left = "0";
  hudCanvas.style.zIndex = "2";
  game.appendChild(hudCanvas);
  const hud = hudCanvas.getContext("2d");

  const speedWrap = document.createElement("div");
  speedWrap.style.display = "flex";
  speedWrap.style.alignItems = "center";
  speedWrap.style.gap = "6px";

  const speedLabel = document.createElement("label");
  speedLabel.textContent = "Speed";
  speedLabel.style.fontSize = "12px";

  const speed = document.createElement("input");
  speed.type = "range";
  speed.min = "5";
  speed.max = "50000";
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

  let running = false;
  let vertices = [];
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  const vertexRadius = 8;
  const seedRadius = 6;

  let pointSize = 5;

  const dotSizeInput = document.getElementById("dotSize");
  if (dotSizeInput) {
    dotSizeInput.value = String(pointSize);
    const applyDotSize = () => {
      const v = parseInt(dotSizeInput.value, 10);
      if (Number.isFinite(v)) {
        pointSize = Math.max(1, Math.min(50, v));
        dotSizeInput.value = String(pointSize);
      }
    };
    dotSizeInput.addEventListener("change", applyDotSize);
    dotSizeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyDotSize();
    });
  }

  const JUMP = 0.5;

  let seedMarker = { x: 0, y: 0 };

  let curr = { x: 0, y: 0 };

  let draggingVertexIndex = -1;
  let draggingSeed = false;
  let dragWasRunning = false;

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

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function cssSize() {
    const barH = settingsBar ? settingsBar.getBoundingClientRect().height : 0;
    return { width: window.innerWidth, height: Math.max(0, window.innerHeight - barH) };
  }

  function setCanvasSize(cvs, ctx, w, h) {
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

    // Resize both canvases (this clears them to BLACK when alpha:false)
    setCanvasSize(base, cloud, w, h);
    setCanvasSize(hudCanvas, hud, w, h);

    // ⬇️ Immediately repaint the cloud to white so it isn't black
    clearCloud();

    const sx = w / oldCssW;
    const sy = h / oldCssH;
    if (isFinite(sx) && isFinite(sy) && oldCssW && oldCssH) {
      vertices = vertices.map(v => ({ x: v.x * sx, y: v.y * sy }));
      seedMarker.x *= sx; seedMarker.y *= sy;
      curr.x *= sx; curr.y *= sy;
    }

    redrawAll();
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

  function drawVertex(v) {
    hud.beginPath();
    hud.arc(v.x, v.y, vertexRadius, 0, Math.PI * 2);
    hud.fillStyle = "#e53935";
    hud.fill();
  }

  function drawHUD() {
    clearHUD();

    if (vertices.length >= 2) {
      hud.beginPath();
      hud.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) hud.lineTo(vertices[i].x, vertices[i].y);
      hud.closePath();
      hud.lineWidth = 1;
      hud.strokeStyle = "rgba(0,0,0,0.2)";
      hud.stroke();
    }

    for (let i = 0; i < vertices.length; i++) drawVertex(vertices[i]);

    hud.beginPath();
    hud.arc(seedMarker.x, seedMarker.y, seedRadius, 0, Math.PI * 2);
    hud.fillStyle = "#1e88e5";
    hud.fill();
  }

  function redrawAll() {
    drawHUD();
  }

  function plotPoint(x, y) {
    cloud.fillStyle = "#000";
    cloud.fillRect(x, y, pointSize, pointSize);
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

    curr = { ...seedMarker };

    carry = 0;
    clearCloud();
    redrawAll();
  }

  function eventToCanvasPos(e) {
    const rect = hudCanvas.getBoundingClientRect();
    const x = (e.clientX ?? (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY ?? (e.touches && e.touches[0].clientY)) - rect.top;
    return { x, y };
  }

  function hitTestVertex(p) {
    const r = vertexRadius + 8;
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const dx = v.x - p.x, dy = v.y - p.y;
      if (dx * dx + dy * dy <= r * r) return i;
    }
    return -1;
  }

  function hitTestSeed(p) {
    const r = seedRadius + 4;
    const dx = seedMarker.x - p.x, dy = seedMarker.y - p.y;
    return dx * dx + dy * dy <= r * r;
  }

  function pointerDown(e) {
    const p = eventToCanvasPos(e);

    const vi = hitTestVertex(p);
    if (vi >= 0) {
      draggingVertexIndex = vi;
      dragWasRunning = running;
      pause();
      hudCanvas.setPointerCapture?.(e.pointerId ?? 1);
      e.preventDefault();
      return;
    }

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
      seedMarker.x = p.x; seedMarker.y = p.y;
      drawHUD();
      return;
    }

    if (draggingVertexIndex >= 0) {
      vertices[draggingVertexIndex].x = p.x;
      vertices[draggingVertexIndex].y = p.y;

      clearCloud();
      drawHUD();
      return;
    }
  }

  function pointerUp(e) {
    if (draggingSeed) {
      draggingSeed = false;
      hudCanvas.releasePointerCapture?.(e.pointerId ?? 1);

      curr = { ...seedMarker };
      carry = 0;

      if (dragWasRunning) start();
      return;
    }

    if (draggingVertexIndex >= 0) {
      draggingVertexIndex = -1;
      hudCanvas.releasePointerCapture?.(e.pointerId ?? 1);

      curr = { ...seedMarker };
      carry = 0;

      if (dragWasRunning) start();
    }
  }

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

  if (!countInput.value.trim()) countInput.value = "3";
  resizeAll();
  initVertices(getCount());

  const { width, height } = cssSize();
  seedMarker.x = width / 2;
  seedMarker.y = height / 2;

  curr = { ...seedMarker };

  clearCloud();
  drawHUD();
});

