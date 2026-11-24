// Kong Royale Optimization & Quality Lab — Interactive Dashboard
let DATA = null;
let compareMode = "presets"; // "presets" | "opt"
let activeSceneIdx = 0;
let activeMetric = "avgFps";
let hideTitle = true;
let sortKey = "fpsDelta";
let sortAsc = false;
let sliderPct = 50;

const $ = (id) => document.getElementById(id);

function pctDelta(before, after, lowerIsBetter = false) {
  if (!before) return 0;
  const raw = ((after - before) / before) * 100;
  return lowerIsBetter ? -raw : raw;
}

function fmtDelta(before, after, lowerIsBetter = false) {
  const raw = ((after - before) / before) * 100;
  const sign = raw > 0 ? "+" : "";
  const good = lowerIsBetter ? raw < -0.5 : raw > 0.5;
  const bad = lowerIsBetter ? raw > 0.5 : raw < -0.5;
  const cls = good ? "delta-pos" : bad ? "delta-neg" : "delta-neu";
  return `<span class="delta-pill ${cls}">${sign}${raw.toFixed(1)}%</span>`;
}

function fmtBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function init() {
  const res = await fetch("data.json");
  DATA = await res.json();

  renderHeaderAndKpis();
  setupComparator();
  renderBenchmarks();
  renderBudgets();
}

function renderHeaderAndKpis() {
  const s = DATA.system;
  $("hero-hw").textContent = `${s.cpu} • ${s.gpu} (${Math.round(s.gpuVramMiB / 1024)} GB VRAM) • ${s.ramGB} GB RAM`;
  const d = new Date(DATA.updatedAt);
  $("hero-date").textContent = `Updated ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  $("footer-commits").textContent = `main ${s.commits.main.slice(0, 7)} → optimization ${s.commits.optimization.slice(0, 7)}`;

  const gameplayOnly = DATA.gameplay.filter((g) => g.id !== "title");
  const avgMain = gameplayOnly.reduce((a, g) => a + g.main.avgFps, 0) / gameplayOnly.length;
  const avgOpt = gameplayOnly.reduce((a, g) => a + g.optimization.avgFps, 0) / gameplayOnly.length;
  const bestGain = [...gameplayOnly].sort((a, b) => pctDelta(b.main.avgFps, b.optimization.avgFps) - pctDelta(a.main.avgFps, a.optimization.avgFps))[0];
  const bestGpu = [...gameplayOnly].sort((a, b) => pctDelta(b.main.gpuMs, b.optimization.gpuMs, true) - pctDelta(a.main.gpuMs, a.optimization.gpuMs, true))[0];

  const highAvgEl = $("preset-high-avg");
  if (highAvgEl) highAvgEl.textContent = `${avgOpt.toFixed(1)} FPS`;

  const kpis = [
    {
      label: "Peak FPS Gain (High)",
      value: `+${(((bestGain.optimization.avgFps - bestGain.main.avgFps) / bestGain.main.avgFps) * 100).toFixed(1)}%`,
      sub: `${bestGain.label}: ${bestGain.main.avgFps} → ${bestGain.optimization.avgFps} FPS`,
      cls: "gain",
    },
    {
      label: "14-Scene Gameplay Avg",
      value: `${avgOpt.toFixed(1)} FPS`,
      sub: `Up from ${avgMain.toFixed(1)} FPS (+${(((avgOpt - avgMain) / avgMain) * 100).toFixed(1)}%) on RTX 5060`,
      cls: "",
    },
    {
      label: "Best GPU Frame Reduction",
      value: `${(((bestGpu.optimization.gpuMs - bestGpu.main.gpuMs) / bestGpu.main.gpuMs) * 100).toFixed(1)}%`,
      sub: `${bestGpu.label}: ${bestGpu.main.gpuMs}ms → ${bestGpu.optimization.gpuMs}ms`,
      cls: "gain",
    },
    {
      label: "Low-Mem POI Cap",
      value: `${DATA.budgets.memoryLowMem.match.peakResidentPois} POIs`,
      sub: `${DATA.budgets.memoryLowMem.match.webglMB} MB WebGL match ceiling (CI gated)`,
      cls: "",
    },
  ];

  $("kpi-grid").innerHTML = kpis.map((k) => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value ${k.cls}">${k.value}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>
  `).join("");
}

function setupComparator() {
  document.querySelectorAll("[data-compare-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      compareMode = btn.dataset.compareMode;
      activeSceneIdx = 0;
      document.querySelectorAll("[data-compare-mode]").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      $("preset-pickers").classList.toggle("hidden", compareMode !== "presets");
      renderScenePills();
      updateCompareImages();
    });
  });

  $("left-preset").addEventListener("change", updateCompareImages);
  $("right-preset").addEventListener("change", updateCompareImages);
  $("swap-presets").addEventListener("click", () => {
    const l = $("left-preset").value;
    $("left-preset").value = $("right-preset").value;
    $("right-preset").value = l;
    updateCompareImages();
  });

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.view === "side";
      document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b === btn));
      $("compare-slider-stage").classList.toggle("hidden", side);
      $("compare-side-stage").classList.toggle("hidden", !side);
    });
  });

  const wrap = $("compare-wrap");
  let dragging = false;
  const setFromClientX = (clientX) => {
    const rect = wrap.getBoundingClientRect();
    const pct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    setSlider(pct);
  };
  wrap.addEventListener("pointerdown", (e) => {
    dragging = true;
    wrap.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  });
  wrap.addEventListener("pointermove", (e) => {
    if (dragging) setFromClientX(e.clientX);
  });
  wrap.addEventListener("pointerup", () => { dragging = false; });
  wrap.addEventListener("pointercancel", () => { dragging = false; });
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") setSlider(Math.max(2, sliderPct - 4));
    if (e.key === "ArrowRight") setSlider(Math.min(98, sliderPct + 4));
  });

  renderScenePills();
  updateCompareImages();
  setSlider(50);
}

function setSlider(pct) {
  sliderPct = pct;
  $("compare-clip").style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  $("compare-divider").style.left = `${pct}%`;
}

function renderScenePills() {
  const list = compareMode === "presets" ? DATA.presetScenes : DATA.optScenes;
  $("scene-pills").innerHTML = list.map((sc, i) => `
    <button class="scene-pill ${i === activeSceneIdx ? "active" : ""}" data-scene-idx="${i}">${sc.title}</button>
  `).join("");
  $("scene-pills").querySelectorAll(".scene-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSceneIdx = Number(btn.dataset.sceneIdx);
      renderScenePills();
      updateCompareImages();
    });
  });
}

function updateCompareImages() {
  const list = compareMode === "presets" ? DATA.presetScenes : DATA.optScenes;
  const sc = list[activeSceneIdx] || list[0];
  let leftSrc, rightSrc, leftText, rightText;

  if (compareMode === "presets") {
    const l = $("left-preset").value;
    const r = $("right-preset").value;
    leftSrc = `images/presets/${l}/${sc.id}.webp`;
    rightSrc = `images/presets/${r}/${sc.id}.webp`;
    leftText = l === "ultra" ? "ULTRA / EPIC" : l.toUpperCase();
    rightText = r === "ultra" ? "ULTRA / EPIC" : r.toUpperCase();
  } else {
    leftSrc = `images/opt/${sc.id}-main.webp`;
    rightSrc = `images/opt/${sc.id}-optimization.webp`;
    leftText = "MAIN (BASELINE)";
    rightText = "OPTIMIZATION";
  }

  $("img-left").src = leftSrc;
  $("img-right").src = rightSrc;
  $("side-img-left").src = leftSrc;
  $("side-img-right").src = rightSrc;
  $("label-left").textContent = leftText;
  $("label-right").textContent = rightText;
  $("side-label-left").textContent = leftText;
  $("side-label-right").textContent = rightText;
  $("scene-title").textContent = sc.title;
  $("scene-subtitle").textContent = sc.subtitle;
}

function renderBenchmarks() {
  document.querySelectorAll("#metric-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeMetric = btn.dataset.metric;
      document.querySelectorAll("#metric-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      drawBarChart();
    });
  });

  $("hide-title").addEventListener("change", (e) => {
    hideTitle = e.target.checked;
    drawBarChart();
    drawBenchTable();
  });

  document.querySelectorAll("#bench-table th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortAsc = !sortAsc;
      else { sortKey = k; sortAsc = k === "label"; }
      drawBenchTable();
    });
  });

  drawBarChart();
  drawBenchTable();
}

function drawBarChart() {
  const rows = DATA.gameplay.filter((r) => !hideTitle || r.id !== "title");
  const lowerIsBetter = activeMetric === "gpuMs" || activeMetric === "cpuMs";
  const unit = lowerIsBetter ? "ms" : "FPS";
  $("chart-direction-note").textContent = lowerIsBetter ? "Lower is better (ms)" : "Higher is better (FPS)";

  const maxVal = Math.max(...rows.flatMap((r) => [r.main[activeMetric], r.optimization[activeMetric]]));

  $("bar-chart").innerHTML = rows.map((r) => {
    const m = r.main[activeMetric];
    const o = r.optimization[activeMetric];
    const mw = Math.max(2, (m / maxVal) * 100);
    const ow = Math.max(2, (o / maxVal) * 100);
    return `
      <div class="bar-row">
        <div class="bar-label" title="${r.label}">${r.label}</div>
        <div class="bar-tracks">
          <div class="bar-line">
            <div class="bar-fill main" style="width:${mw.toFixed(1)}%"></div>
            <span class="bar-num">${m} ${unit}</span>
          </div>
          <div class="bar-line">
            <div class="bar-fill opt" style="width:${ow.toFixed(1)}%"></div>
            <span class="bar-num">${o} ${unit}</span>
          </div>
        </div>
        <div class="bar-delta">${fmtDelta(m, o, lowerIsBetter)}</div>
      </div>
    `;
  }).join("");
}

function drawBenchTable() {
  const rows = DATA.gameplay
    .filter((r) => !hideTitle || r.id !== "title")
    .map((r) => ({
      ...r,
      mainFps: r.main.avgFps,
      optFps: r.optimization.avgFps,
      fpsDelta: pctDelta(r.main.avgFps, r.optimization.avgFps),
      low1Delta: pctDelta(r.main.low1Fps, r.optimization.low1Fps),
      gpuDelta: pctDelta(r.main.gpuMs, r.optimization.gpuMs, true),
      calls: r.optimization.calls,
      tris: r.optimization.tris,
    }));

  rows.sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? av - bv : bv - av;
  });

  $("bench-tbody").innerHTML = rows.map((r) => `
    <tr>
      <td><strong>${r.label}</strong></td>
      <td class="mono">${r.main.avgFps.toFixed(1)}</td>
      <td class="mono"><strong>${r.optimization.avgFps.toFixed(1)}</strong></td>
      <td>${fmtDelta(r.main.avgFps, r.optimization.avgFps)}</td>
      <td>${fmtDelta(r.main.low1Fps, r.optimization.low1Fps)}</td>
      <td class="mono">${r.main.gpuMs.toFixed(2)} → ${r.optimization.gpuMs.toFixed(2)} ${fmtDelta(r.main.gpuMs, r.optimization.gpuMs, true)}</td>
      <td class="mono">${r.optimization.calls}</td>
      <td class="mono">${(r.optimization.tris / 1e6).toFixed(2)}M</td>
    </tr>
  `).join("");
}

function renderBudgets() {
  const sz = DATA.budgets.sizeGzBytes;
  const entries = [
    { name: "Entry Chunk", desc: "Initial HTML/JS bootstrap", bytes: sz.entry },
    { name: "Boot Bundle", desc: "Core engine to playable title", bytes: sz.boot },
    { name: "Lazy Chunks", desc: "Deferred world & UI modules", bytes: sz.lazy },
    { name: "Web Workers", desc: "Off-thread terrain & transcoders", bytes: sz.workers },
  ];
  const maxB = Math.max(...entries.map((e) => e.bytes));
  $("size-budgets").innerHTML = entries.map((e) => `
    <div class="budget-item">
      <div class="budget-item-top">
        <span><strong>${e.name}</strong> <span class="muted small">— ${e.desc}</span></span>
        <span class="mono">${fmtBytes(e.bytes)}</span>
      </div>
      <div class="budget-track">
        <div class="budget-bar" style="width:${Math.max(4, (e.bytes / maxB) * 100).toFixed(1)}%"></div>
      </div>
    </div>
  `).join("");

  const lm = DATA.budgets.memoryLowMem;
  const phases = [
    {
      name: "Title Screen",
      webgl: `${lm.title.webglMB} MB`,
      meta: `${lm.title.textureCount} textures<br>JS Heap ≤ ${lm.title.heapUsedMB} MB`,
    },
    {
      name: "Plane Phase",
      webgl: `${lm.plane.webglMB} MB`,
      meta: `${lm.plane.textureCount} textures<br>Streaming active`,
    },
    {
      name: "In-Match (60s)",
      webgl: `${lm.match.webglMB} MB`,
      meta: `Max ${lm.match.peakResidentPois} resident POIs<br>JS Heap ≤ ${lm.match.heapUsedMB} MB`,
    },
  ];
  $("mem-budgets").innerHTML = phases.map((p) => `
    <div class="mem-box">
      <div class="mem-phase">${p.name}</div>
      <div class="mem-stat">${p.webgl}</div>
      <div class="mem-meta">${p.meta}</div>
    </div>
  `).join("");
}

init().catch((err) => {
  console.error(err);
  $("hero-hw").textContent = "Failed to load data.json";
});
