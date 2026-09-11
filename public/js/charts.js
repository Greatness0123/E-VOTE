// Tiny dependency-free canvas chart helpers. No CDN, no external library —
// satisfies the app's CSP (script-src 'self' only) and keeps the bundle small.

function drawLineChart(canvas, points, { color = "#c9a227", label = "" } = {}) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (points.length === 0) {
    ctx.fillStyle = "#6b7570";
    ctx.font = "13px sans-serif";
    ctx.fillText("No data yet", 10, h / 2);
    return;
  }

  const padding = 28;
  const maxY = Math.max(...points.map((p) => p.y), 1);
  const stepX = (w - padding * 2) / Math.max(points.length - 1, 1);

  // Axes
  ctx.strokeStyle = "#e4e2da";
  ctx.beginPath();
  ctx.moveTo(padding, h - padding);
  ctx.lineTo(w - padding, h - padding);
  ctx.stroke();

  // Line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = padding + i * stepX;
    const y = h - padding - (p.y / maxY) * (h - padding * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Points
  ctx.fillStyle = color;
  points.forEach((p, i) => {
    const x = padding + i * stepX;
    const y = h - padding - (p.y / maxY) * (h - padding * 2);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#1c2422";
  ctx.font = "11px sans-serif";
  ctx.fillText(`max: ${maxY}`, padding, 14);
}

function drawBarChart(canvas, bars, { color = "#0f4d3a" } = {}) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (bars.length === 0) {
    ctx.fillStyle = "#6b7570";
    ctx.font = "13px sans-serif";
    ctx.fillText("No data yet", 10, h / 2);
    return;
  }

  const padding = 28;
  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  const barWidth = (w - padding * 2) / bars.length - 10;

  bars.forEach((b, i) => {
    const barHeight = (b.value / maxVal) * (h - padding * 2);
    const x = padding + i * ((w - padding * 2) / bars.length) + 5;
    const y = h - padding - barHeight;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#1c2422";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    const label = b.label.length > 10 ? `${b.label.slice(0, 9)}…` : b.label;
    ctx.fillText(label, x + barWidth / 2, h - padding + 12);
    ctx.fillText(String(b.value), x + barWidth / 2, y - 4);
  });
  ctx.textAlign = "left";
}

window.charts = { drawLineChart, drawBarChart };
