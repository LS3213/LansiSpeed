const INITIALIZING = 0;
const READY = 1;
const RUNNING = 2;
const FINISHED = 3;

const HISTORY_STORAGE_KEY = "librespeed-history";
const UNIT_STORAGE_KEY = "librespeed-unit";
const HISTORY_LIMIT = 6;

const UNITS = {
  mbps: { label: "Mbps", divisor: 1 },
  mbs: { label: "MB/s", divisor: 8 },
};

const buttonTexts = {
  [INITIALIZING]: "初始化中...",
  [READY]: "开始测速",
  [RUNNING]: "停止测速",
  [FINISHED]: "重新测速",
};

const statusTexts = {
  [INITIALIZING]: "正在准备测速环境",
  [READY]: "测速环境已就绪",
  [RUNNING]: "正在执行网络质量测试",
  [FINISHED]: "最近一次测速结果已生成",
};

const stageTexts = {
  "-1": "等待开始",
  0: "正在识别连接信息",
  1: "Download 测试中",
  2: "Ping / Jitter 测试中",
  3: "Upload 测试中",
  4: "结果整理中",
  5: "测速完成",
};

const testState = {
  state: INITIALIZING,
  speedtest: null,
  testData: null,
  testDataDirty: false,
  unit: loadPreferredUnit(),
  history: loadHistory(),
  resultSaved: false,
};

window.addEventListener("DOMContentLoaded", async () => {
  createSpeedtest();
  hookUpButtons();
  renderHistory();
  startRenderingLoop();
  await applySettingsJSON();
  applySingleServerMode();
});

function createSpeedtest() {
  testState.speedtest = new Speedtest();
  testState.speedtest.onupdate = (data) => {
    testState.testData = data;
    testState.testDataDirty = true;
  };
  testState.speedtest.onend = (aborted) => {
    testState.state = aborted ? READY : FINISHED;
    if (!aborted) {
      saveCurrentResult();
      renderHistory();
    }
  };
}

function hookUpButtons() {
  document
    .querySelector("#start-button")
    .addEventListener("click", startButtonClickHandler);
  document.querySelector("#unit-toggle").addEventListener("click", toggleUnit);
  document.querySelector("#open-history").addEventListener("click", () => {
    document.querySelector("#history-panel").scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
  document
    .querySelector("#clear-history")
    .addEventListener("click", clearHistory);
  updateUnitLabels();
}

function startButtonClickHandler() {
  switch (testState.state) {
    case READY:
    case FINISHED:
      testState.resultSaved = false;
      testState.speedtest.start();
      testState.state = RUNNING;
      return;
    case RUNNING:
      testState.speedtest.abort();
      return;
    default:
      return;
  }
}

async function applySettingsJSON() {
  const candidates = ["settings.json", "frontend/settings.json"];
  for (const path of candidates) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      const settings = await response.json();
      if (!settings || typeof settings !== "object") continue;
      for (const setting in settings) {
        testState.speedtest.setParameter(setting, settings[setting]);
      }
      return;
    } catch {
      // Ignore and try the next location.
    }
  }
}

function applySingleServerMode() {
  testState.speedtest.setParameter("url_dl", "backend/garbage.php");
  testState.speedtest.setParameter("url_ul", "backend/empty.php");
  testState.speedtest.setParameter("url_ping", "backend/empty.php");
  testState.speedtest.setParameter("url_getIp", "backend/getIP.php");
  testState.speedtest.setParameter("telemetry_level", "off");
  testState.state = READY;
}

function startRenderingLoop() {
  const startButton = document.querySelector("#start-button");
  const statusText = document.querySelector("#status-text");
  const statusDetail = document.querySelector("#status-detail");
  const connectionText = document.querySelector("#connection-text");
  const serverSummary = document.querySelector("#server-summary");
  const downloadMetric = document.querySelector("#download-metric");
  const uploadMetric = document.querySelector("#upload-metric");
  const pingMetric = document.querySelector("#ping-metric");
  const jitterMetric = document.querySelector("#jitter-metric");

  const gauges = document.querySelectorAll("#download-gauge, #upload-gauge");
  const downloadProgress = document.querySelector("#download-gauge .progress");
  const uploadProgress = document.querySelector("#upload-gauge .progress");
  const downloadGauge = document.querySelector("#download-gauge .speed");
  const uploadGauge = document.querySelector("#upload-gauge .speed");
  const downloadText = document.querySelector("#download-speed");
  const uploadText = document.querySelector("#upload-speed");
  const pingText = document.querySelector("#ping");
  const jitterText = document.querySelector("#jitter");
  const pingAndJitter = document.querySelectorAll(".ping, .jitter");
  const networkInfo = document.querySelector("#network-info");

  function renderUI() {
    startButton.textContent = buttonTexts[testState.state];
    startButton.classList.toggle("disabled", testState.state === INITIALIZING);
    startButton.classList.toggle("active", testState.state === RUNNING);

    statusText.textContent = statusTexts[testState.state];
    statusDetail.textContent = currentStageText();
    serverSummary.textContent = currentConnectionSummary();

    gauges.forEach((element) =>
      element.classList.toggle(
        "enabled",
        testState.state === RUNNING || testState.state === FINISHED
      )
    );

    pingAndJitter.forEach((element) =>
      element.classList.toggle(
        "hidden",
        !(
          testState.testData &&
          testState.testData.pingStatus !== undefined &&
          testState.testData.jitterStatus !== undefined
        )
      )
    );

    if (testState.testDataDirty) {
      downloadProgress.style = `--progress-rotation: ${
        testState.testData.dlProgress * 180
      }deg`;
      uploadProgress.style = `--progress-rotation: ${
        testState.testData.ulProgress * 180
      }deg`;
      downloadGauge.style = `--speed-rotation: ${mbpsToRotation(
        testState.testData.dlStatus,
        testState.testData.testState === 1
      )}deg`;
      uploadGauge.style = `--speed-rotation: ${mbpsToRotation(
        testState.testData.ulStatus,
        testState.testData.testState === 3
      )}deg`;

      downloadText.textContent = formatSpeedValue(testState.testData.dlStatus);
      uploadText.textContent = formatSpeedValue(testState.testData.ulStatus);
      downloadMetric.textContent = formatSpeedValue(testState.testData.dlStatus);
      uploadMetric.textContent = formatSpeedValue(testState.testData.ulStatus);
      pingText.textContent = numberToText(testState.testData.pingStatus);
      jitterText.textContent = numberToText(testState.testData.jitterStatus);
      pingMetric.textContent = numberToText(testState.testData.pingStatus);
      jitterMetric.textContent = numberToText(testState.testData.jitterStatus);

      if (testState.testData.clientIp) {
        networkInfo.classList.remove("hidden");
        networkInfo.textContent = `当前出口信息：${testState.testData.clientIp}`;
        connectionText.textContent = testState.testData.clientIp;
      }

      testState.testDataDirty = false;
    }

    requestAnimationFrame(renderUI);
  }

  renderUI();
}

function saveCurrentResult() {
  if (!testState.testData || testState.resultSaved) return;
  testState.history.unshift({
    time: new Date().toISOString(),
    label: "本机测速",
    download: Number(testState.testData.dlStatus || 0),
    upload: Number(testState.testData.ulStatus || 0),
    ping: Number(testState.testData.pingStatus || 0),
    jitter: Number(testState.testData.jitterStatus || 0),
  });
  testState.history = testState.history.slice(0, HISTORY_LIMIT);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(testState.history));
  testState.resultSaved = true;
}

function renderHistory() {
  const list = document.querySelector("#history-list");
  const empty = document.querySelector("#history-empty");
  const clearButton = document.querySelector("#clear-history");

  list.innerHTML = "";
  const hasHistory = testState.history.length > 0;
  empty.classList.toggle("hidden", hasHistory);
  clearButton.classList.toggle("hidden", !hasHistory);

  for (const entry of testState.history) {
    const item = document.createElement("li");
    item.className = "history-item";
    item.innerHTML = `
      <div class="history-row">
        <strong>${escapeHTML(entry.label)}</strong>
        <span>${formatHistoryTime(entry.time)}</span>
      </div>
      <div class="history-grid">
        <span>Download ${formatStoredSpeed(entry.download)}</span>
        <span>Upload ${formatStoredSpeed(entry.upload)}</span>
        <span>Ping ${numberToText(entry.ping)} ms</span>
        <span>Jitter ${numberToText(entry.jitter)} ms</span>
      </div>
    `;
    list.appendChild(item);
  }
}

function clearHistory() {
  testState.history = [];
  localStorage.removeItem(HISTORY_STORAGE_KEY);
  renderHistory();
}

function toggleUnit() {
  testState.unit = testState.unit === "mbps" ? "mbs" : "mbps";
  localStorage.setItem(UNIT_STORAGE_KEY, testState.unit);
  updateUnitLabels();
  testState.testDataDirty = true;
  renderHistory();
}

function updateUnitLabels() {
  const unit = UNITS[testState.unit];
  document.querySelector("#unit-toggle").textContent = `单位：${unit.label}`;
  document.querySelector("#download-unit").textContent = unit.label;
  document.querySelector("#upload-unit").textContent = unit.label;
  document
    .querySelectorAll("#download-gauge h1 em, #upload-gauge h1 em")
    .forEach((element) => {
      element.textContent = unit.label;
    });
}

function currentStageText() {
  if (!testState.testData || typeof testState.testData.testState === "undefined") {
    return statusTexts[testState.state];
  }
  return stageTexts[testState.testData.testState] || statusTexts[testState.state];
}

function currentConnectionSummary() {
  if (testState.state === INITIALIZING) return "等待测速启动";
  if (testState.state === RUNNING) return "正在进行测速";
  if (testState.state === FINISHED) return "测速已完成，可再次测试";
  return "已连接到当前部署环境";
}

function formatSpeedValue(value) {
  if (!value) return "00";
  return numberToText(Number(value) / UNITS[testState.unit].divisor);
}

function formatStoredSpeed(value) {
  return `${numberToText(Number(value) / UNITS[testState.unit].divisor)} ${
    UNITS[testState.unit].label
  }`;
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadPreferredUnit() {
  return localStorage.getItem(UNIT_STORAGE_KEY) === "mbs" ? "mbs" : "mbps";
}

function formatHistoryTime(time) {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function mbpsToRotation(speed, oscillate) {
  speed = Number(speed);
  if (speed <= 0) return 0;

  const logSpeed = Math.log10(speed + 1);
  const power = logSpeed / Math.log10(10001);
  const oscillation = oscillate ? 1 + 0.01 * Math.sin(Date.now() / 100) : 1;
  return Math.max(Math.min(power * oscillation * 180, 180), 0);
}

function numberToText(value) {
  if (value === null || value === undefined || value === "") return "00";
  value = Number(value);
  if (!Number.isFinite(value)) return "00";
  if (value < 10) return value.toFixed(2);
  if (value < 100) return value.toFixed(1);
  return value.toFixed(0);
}
