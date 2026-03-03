const BASE_API_URL =
  "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=300&order=volume&ascending=false";
const REFRESH_MS = 5 * 60 * 1000;

const STATE = {
  raw: [],
  filtered: [],
  chart: null,
  autoRefreshTimer: null,
  loading: false,
};

function proxyCandidates(url) {
  return [
    url,
    `https://cors.isomorphic-git.org/${url}`,
    `https://corsproxy.io/${url}`,
  ];
}

function withTimeout(promiseFactory, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("请求超时")), timeoutMs);
    promiseFactory()
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

async function fetchJson(url) {
  const response = await withTimeout(
    () =>
      fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
    10000
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchMarketsRaw() {
  let lastError = new Error("未知错误");
  const urls = proxyCandidates(BASE_API_URL);

  for (const url of urls) {
    try {
      const payload = await fetchJson(url);
      const markets = Array.isArray(payload) ? payload : payload.data || [];
      if (!Array.isArray(markets) || markets.length === 0) {
        throw new Error("返回数据为空");
      }
      return markets;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOutcomePrices(market) {
  let prices = [];

  if (Array.isArray(market.outcomePrices)) {
    prices = market.outcomePrices.map((value) => safeNumber(value, 0));
  } else if (typeof market.outcomePrices === "string" && market.outcomePrices.trim()) {
    try {
      const parsed = JSON.parse(market.outcomePrices);
      if (Array.isArray(parsed)) {
        prices = parsed.map((value) => safeNumber(value, 0));
      }
    } catch (_error) {
      prices = [];
    }
  }

  if (prices.length < 2 && Array.isArray(market.outcomes)) {
    prices = market.outcomes.map((item) => safeNumber(item.price, 0));
  }

  const yes = Math.min(1, Math.max(0, safeNumber(prices[0], 0)));
  let no = safeNumber(prices[1], 1 - yes);
  no = Math.min(1, Math.max(0, no));
  return { yes, no };
}

function computeHeatIndex(yes, volume, liquidity) {
  const participation = Math.log10(volume + 1) * 30;
  const conviction = Math.abs(yes - 0.5) * 100;
  const depth = Math.log10(liquidity + 1) * 8;
  return participation + conviction + depth;
}

function normalizeMarket(market) {
  const question = String(market.question || "").trim();
  if (!question) {
    return null;
  }

  const volume = safeNumber(market.volumeNum ?? market.volume, 0);
  if (volume <= 0) {
    return null;
  }

  const liquidity = safeNumber(market.liquidityNum ?? market.liquidity, 0);
  const { yes, no } = parseOutcomePrices(market);
  const heat = computeHeatIndex(yes, volume, liquidity);

  return {
    id: String(market.id ?? market.conditionId ?? question),
    question,
    slug: String(market.slug || ""),
    endDate: String(market.endDate || market.endDateIso || ""),
    yes,
    no,
    volume,
    liquidity,
    heat,
  };
}

function updateStatus(text, isError = false) {
  const node = document.getElementById("data-status");
  node.textContent = text;
  node.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function sortMarkets(markets, sortBy) {
  const sorted = [...markets];
  if (sortBy === "volume") {
    sorted.sort((a, b) => b.volume - a.volume);
  } else if (sortBy === "yesHigh") {
    sorted.sort((a, b) => b.yes - a.yes);
  } else if (sortBy === "yesLow") {
    sorted.sort((a, b) => a.yes - b.yes);
  } else {
    sorted.sort((a, b) => b.heat - a.heat);
  }
  return sorted;
}

function applyFilters() {
  const minVolume = safeNumber(document.getElementById("min-volume").value, 0);
  const limit = Number.parseInt(document.getElementById("limit-select").value, 10) || 20;
  const sortBy = document.getElementById("sort-select").value;

  const filtered = STATE.raw.filter((market) => market.volume >= minVolume);
  STATE.filtered = sortMarkets(filtered, sortBy).slice(0, limit);
}

function renderTable() {
  const tbody = document.querySelector("#market-table tbody");
  tbody.innerHTML = "";

  if (STATE.filtered.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7">暂无符合条件的数据，请降低筛选门槛后重试。</td>`;
    tbody.appendChild(row);
    return;
  }

  STATE.filtered.forEach((market, index) => {
    const url = market.slug
      ? `https://polymarket.com/event/${market.slug}`
      : "https://polymarket.com/";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="mono">${index + 1}</td>
      <td><a class="market-link" href="${url}" target="_blank" rel="noopener noreferrer">${market.question}</a></td>
      <td class="mono yes">${(market.yes * 100).toFixed(1)}%</td>
      <td class="mono no">${(market.no * 100).toFixed(1)}%</td>
      <td class="mono">${formatMoney(market.volume)}</td>
      <td class="mono">${formatMoney(market.liquidity)}</td>
      <td class="mono">${market.heat.toFixed(1)}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderSummary() {
  const count = STATE.filtered.length;
  const totalVolume = STATE.filtered.reduce((sum, market) => sum + market.volume, 0);
  const avgYes = count > 0 ? STATE.filtered.reduce((sum, market) => sum + market.yes, 0) / count : 0;
  const bullish = STATE.filtered.filter((market) => market.yes > 0.5).length;

  document.getElementById("stat-count").textContent = String(count);
  document.getElementById("stat-volume").textContent = formatMoney(totalVolume);
  document.getElementById("stat-yes").textContent = `${(avgYes * 100).toFixed(1)}%`;

  const riskTone = avgYes >= 0.55 ? "风险偏好较强" : avgYes <= 0.45 ? "风险偏好偏谨慎" : "风险偏好中性";
  document.getElementById("summary-text").textContent =
    `当前筛选下共有 ${count} 个重点市场，合计成交量 ${formatMoney(totalVolume)}，` +
    `平均 Yes 概率 ${(avgYes * 100).toFixed(1)}%，其中 ${bullish} 个市场 Yes 概率超过 50%，整体 ${riskTone}。`;
}

function renderChart() {
  const canvas = document.getElementById("trendChart");
  if (STATE.chart) {
    STATE.chart.destroy();
  }

  const labels = STATE.filtered.map((market) => {
    if (market.question.length <= 30) {
      return market.question;
    }
    return `${market.question.slice(0, 30)}...`;
  });
  const data = STATE.filtered.map((market) => Number.parseFloat(market.heat.toFixed(2)));

  STATE.chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "热度指数",
          data,
          backgroundColor: "rgba(42, 245, 152, 0.35)",
          borderColor: "rgba(36, 212, 216, 0.9)",
          borderWidth: 1.2,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: "#a9c4cf", maxRotation: 0, autoSkip: true },
          grid: { color: "rgba(42, 74, 91, 0.35)" },
        },
        y: {
          ticks: { color: "#a9c4cf" },
          grid: { color: "rgba(42, 74, 91, 0.35)" },
        },
      },
    },
  });
}

function updateLastUpdated() {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  document.getElementById("last-updated").textContent = `最后更新：${formatted}`;
}

function renderAll() {
  applyFilters();
  renderSummary();
  renderTable();
  renderChart();
  updateLastUpdated();
}

async function loadData() {
  if (STATE.loading) {
    return;
  }
  STATE.loading = true;
  updateStatus("正在加载 Polymarket 数据…");

  try {
    const rawMarkets = await fetchMarketsRaw();
    STATE.raw = rawMarkets.map(normalizeMarket).filter(Boolean);
    renderAll();
    updateStatus(`加载完成：${STATE.raw.length} 条市场记录`);
  } catch (error) {
    updateStatus(`加载失败：${error.message}`, true);
    if (STATE.raw.length > 0) {
      renderAll();
    }
  } finally {
    STATE.loading = false;
  }
}

function configureAutoRefresh(enabled) {
  if (STATE.autoRefreshTimer) {
    clearInterval(STATE.autoRefreshTimer);
    STATE.autoRefreshTimer = null;
  }
  if (enabled) {
    STATE.autoRefreshTimer = setInterval(loadData, REFRESH_MS);
  }
}

function bindEvents() {
  document.getElementById("sort-select").addEventListener("change", renderAll);
  document.getElementById("limit-select").addEventListener("change", renderAll);

  const minVolume = document.getElementById("min-volume");
  const minVolumeValue = document.getElementById("min-volume-value");
  const updateMinVolumeLabel = () => {
    minVolumeValue.textContent = formatMoney(safeNumber(minVolume.value, 0));
  };
  minVolume.addEventListener("input", () => {
    updateMinVolumeLabel();
    renderAll();
  });
  updateMinVolumeLabel();

  document.getElementById("refresh-btn").addEventListener("click", loadData);

  const autoRefresh = document.getElementById("auto-refresh-toggle");
  autoRefresh.addEventListener("change", () => {
    configureAutoRefresh(autoRefresh.checked);
  });
}

async function init() {
  bindEvents();
  configureAutoRefresh(document.getElementById("auto-refresh-toggle").checked);
  await loadData();
}

window.__POLY_APP_INIT__ = init;
init();
