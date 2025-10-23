async function fetchMarkets() {
  const res = await fetch("https://gamma-api.polymarket.com/markets");
  const json = await res.json();
  return json.data
    .filter(m => m.volume && m.question)
    .map(m => ({
      question: m.question,
      yes: m.outcomes?.[0]?.price || 0,
      volume: parseFloat(m.volume),
      slug: m.slug
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);
}
async function render() {
  const markets = await fetchMarkets();
  const tbody = document.querySelector("#market-table tbody");
  tbody.innerHTML = "";
  let sumYes = 0;
  markets.forEach((m, i) => {
    sumYes += m.yes;
    const row = `
      <tr>
        <td>${i + 1}</td>
        <td><a href="https://polymarket.com/event/${m.slug}" target="_blank">${m.question}</a></td>
        <td>${(m.yes * 100).toFixed(1)}%</td>
        <td>${m.volume.toLocaleString()}</td>
        <td>${(Math.sqrt(m.volume) * m.yes * 100).toFixed(1)}</td>
      </tr>`;
    tbody.innerHTML += row;
  });
  const avgYes = (sumYes / markets.length * 100).toFixed(1);
  document.querySelector("#summary-text").textContent = `前10市场平均“YES”概率为 ${avgYes}%，显示市场整体${avgYes > 50 ? '偏乐观' : '偏谨慎'}。`;
  renderChart(markets);
}
function renderChart(markets) {
  const ctx = document.getElementById("trendChart");
  const labels = markets.map(m => m.question.slice(0, 25) + "...");
  const data = markets.map(m => (Math.sqrt(m.volume) * m.yes * 100).toFixed(1));
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '热度指数',
        data,
        backgroundColor: 'rgba(0, 255, 157, 0.5)'
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#ccc' } },
        y: { ticks: { color: '#ccc' } }
      }
    }
  });
}
render();
setInterval(render, 600000);
