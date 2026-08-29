/**
 * exportToPdf(data, modelName)
 * Opens a styled print window and triggers window.print().
 * The user saves it as PDF via the browser's print dialog.
 * Zero external dependencies.
 */
export function exportToPdf(data, modelName) {
  const passRate = data?.pass_rate ?? 0
  const healthScore =
    typeof data?.health_score === 'object'
      ? (data.health_score?.overall ?? 0)
      : (data?.health_score ?? 0)
  const totalTests = data?.total_tests ?? 0
  const passedCount = data?.passed_count ?? 0
  const timestamp = data?.timestamp
    ? new Date(data.timestamp).toLocaleString()
    : new Date().toLocaleString()

  const avgScores = data?.avg_scores || {}
  const scoreRows = Object.entries(avgScores)
    .map(([k, v]) => {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      const val = Math.round(Number(v) || 0)
      const color = val >= 80 ? '#16a34a' : val >= 60 ? '#d97706' : '#dc2626'
      return `
        <tr>
          <td>${label}</td>
          <td>
            <div class="bar-wrap">
              <div class="bar" style="width:${val}%;background:${color}"></div>
            </div>
          </td>
          <td class="score" style="color:${color}">${val}</td>
        </tr>`
    })
    .join('')

  const testRows = (data?.test_cases || [])
    .slice(0, 50)          // cap at 50 rows for PDF readability
    .map((t, i) => {
      const passed = t.passed !== undefined ? t.passed : true
      const score = t.score ?? (passed ? 90 : 20)
      const badge = passed
        ? '<span class="badge pass">✓ Pass</span>'
        : '<span class="badge fail">✗ Fail</span>'
      const prompt = (t.prompt || '').slice(0, 120)
      return `
        <tr class="${i % 2 === 0 ? '' : 'alt'}">
          <td class="num">${i + 1}</td>
          <td>${prompt}${t.prompt?.length > 120 ? '…' : ''}</td>
          <td>${t.category || '—'}</td>
          <td>${badge}</td>
          <td class="score">${score}</td>
        </tr>`
    })
    .join('')

  const failureBreakdown = data?.failure_breakdown || {}
  const failureRows = Object.entries(failureBreakdown)
    .map(([k, v]) => `<tr><td>${k}</td><td class="score">${v}</td></tr>`)
    .join('')

  const gaugeColor = passRate >= 80 ? '#16a34a' : passRate >= 60 ? '#d97706' : '#dc2626'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>CriticAI Report — ${modelName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #1e293b;
    background: #fff;
    font-size: 13px;
    line-height: 1.5;
  }
  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, #4c1d95, #0c4a6e);
    color: #fff;
    padding: 28px 32px 24px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .header h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
  .header .sub { font-size: 11px; color: rgba(255,255,255,0.65); margin-top: 4px; }
  .header .meta { text-align: right; font-size: 11px; color: rgba(255,255,255,0.75); }
  .header .meta strong { display: block; font-size: 14px; color: #fff; }

  /* ── Content ── */
  .content { padding: 24px 32px; }

  /* ── Stats cards ── */
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
  .stat {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px;
    text-align: center;
  }
  .stat .label { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #64748b; font-weight: 600; }
  .stat .value { font-size: 26px; font-weight: 800; margin-top: 4px; }
  .stat.green .value { color: #16a34a; }
  .stat.amber .value { color: #d97706; }
  .stat.blue  .value { color: #2563eb; }
  .stat.red   .value { color: #dc2626; }

  /* ── Section title ── */
  h2 {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .6px;
    color: #475569;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 6px;
    margin: 0 0 14px;
  }
  .section { margin-bottom: 28px; }

  /* ── Score bars ── */
  table { width: 100%; border-collapse: collapse; }
  .scores-table td { padding: 6px 8px; vertical-align: middle; }
  .scores-table td:first-child { width: 160px; font-weight: 600; color: #334155; }
  .scores-table td:last-child { width: 50px; text-align: right; }
  .bar-wrap { height: 8px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
  .bar { height: 100%; border-radius: 99px; }
  .score { font-weight: 700; font-size: 13px; }

  /* ── Test cases table ── */
  .tests-table th {
    background: #f8fafc;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .6px;
    color: #64748b;
    padding: 8px 10px;
    font-weight: 700;
    border-bottom: 1px solid #e2e8f0;
    text-align: left;
  }
  .tests-table td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
  .tests-table tr.alt { background: #f8fafc; }
  .num { color: #94a3b8; font-family: monospace; font-size: 11px; width: 30px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 10px;
    font-weight: 700;
  }
  .badge.pass { background: #dcfce7; color: #16a34a; border: 1px solid #bbf7d0; }
  .badge.fail { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; }

  /* ── Footer ── */
  .footer {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    font-size: 10px;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- Print button (hidden on print) -->
<div class="no-print" style="padding:12px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:12px">
  <button onclick="window.print()" style="background:#4c1d95;color:#fff;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
    🖨️ Save as PDF
  </button>
  <span style="color:#64748b;font-size:12px">Use your browser's <strong>Save as PDF</strong> option in the print dialog.</span>
</div>

<div class="header">
  <div>
    <div style="font-size:11px;color:rgba(255,255,255,0.6);font-weight:600;margin-bottom:6px">CRITICAI — LLM EVALUATION REPORT</div>
    <h1>${modelName}</h1>
    <div class="sub">Generated by CriticAI Multi-Agent Evaluation System</div>
  </div>
  <div class="meta">
    <strong>Evaluation Date</strong>
    ${timestamp}
  </div>
</div>

<div class="content">

  <!-- Stats -->
  <div class="stats">
    <div class="stat ${healthScore >= 80 ? 'green' : healthScore >= 60 ? 'amber' : 'red'}">
      <div class="label">Health Score</div>
      <div class="value">${Math.round(healthScore)}</div>
    </div>
    <div class="stat ${passRate >= 80 ? 'green' : passRate >= 60 ? 'amber' : 'red'}">
      <div class="label">Pass Rate</div>
      <div class="value">${Math.round(passRate)}%</div>
    </div>
    <div class="stat blue">
      <div class="label">Total Tests</div>
      <div class="value">${totalTests}</div>
    </div>
    <div class="stat ${passedCount === totalTests ? 'green' : 'amber'}">
      <div class="label">Passed</div>
      <div class="value">${passedCount}/${totalTests}</div>
    </div>
  </div>

  <!-- Average Scores -->
  ${scoreRows ? `
  <div class="section">
    <h2>Average Metric Scores</h2>
    <table class="scores-table">
      <tbody>${scoreRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Failure Breakdown -->
  ${failureRows ? `
  <div class="section">
    <h2>Failure Breakdown</h2>
    <table class="scores-table">
      <tbody>${failureRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Test Cases -->
  ${testRows ? `
  <div class="section">
    <h2>Test Case Results${totalTests > 50 ? ' (Top 50)' : ''}</h2>
    <table class="tests-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Prompt</th>
          <th>Category</th>
          <th>Result</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>${testRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Summary -->
  ${data?.summary ? `
  <div class="section">
    <h2>Summary</h2>
    <p style="color:#334155;line-height:1.7">${data.summary}</p>
  </div>` : ''}

  <div class="footer">
    <span>CriticAI — AI Model Evaluation Platform</span>
    <span>Model: ${modelName} | Report generated ${timestamp}</span>
  </div>

</div>

<script>
  // Auto-open print dialog after a short delay
  setTimeout(() => window.print(), 400)
</script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    alert('Please allow popups for this site to export PDF.')
    return
  }
  win.document.write(html)
  win.document.close()
}
