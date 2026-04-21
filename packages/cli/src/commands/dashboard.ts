import { Command } from 'commander'
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { getEngine } from './engine'

// ── Dashboard 数据接口 ──────────────────────────────────────

interface DashboardData {
  totalMistakes: number
  totalRules: number
  totalVerifications: number
  byStatus: Record<string, number>
  byCategory: Array<{ category: string; count: number; recurrenceTotal: number }>
  recentMistakes: Array<{
    id: string; category: string; status: string; trigger_type: string
    recurrence_count: number; user_correction: string | null
    ai_misunderstanding: string | null; created_at: string
  }>
  rules: Array<{
    id: string; category: string; rule_text: string; status: string
    pass_count: number; fail_count: number; created_at: string
  }>
}

// ── Section 定义 ──────────────────────────────────────────────
// 每个 section 是独立的 vizual spec（flat，不嵌套），渲染到自己的 DOM 容器中

interface Section {
  id: string
  /** section 标题，渲染为 HTML h2 */
  title?: string
  /** 独立的 vizual spec，root 指向该 section 的主元素 */
  spec: object
}

function buildSections(data: DashboardData): Section[] {
  const sections: Section[] = []

  // ── KPI 区：每个 BigValue 独立渲染到自己的容器 ──
  const pending = data.byStatus['pending'] ?? 0
  const recurring = data.byStatus['recurring'] ?? 0

  const kpiMetrics = [
    { id: 'kpi-total', value: data.totalMistakes, title: 'Total Mistakes' },
    { id: 'kpi-pending', value: pending, title: 'Pending', subtitle: 'awaiting review' },
    { id: 'kpi-recurring', value: recurring, title: 'Recurring', subtitle: 'repeated mistakes' },
    { id: 'kpi-rules', value: data.totalRules, title: 'Active Rules', suffix: ` / ${data.totalVerifications} verified` },
  ]

  for (const m of kpiMetrics) {
    sections.push({
      id: m.id,
      spec: {
        root: 'v',
        elements: {
          v: {
            type: 'BigValue',
            props: { value: m.value, title: m.title, subtitle: m.subtitle, suffix: m.suffix },
            children: []
          }
        }
      }
    })
  }

  // ── Category 柱状图 ──
  if (data.byCategory.length > 0) {
    sections.push({
      id: 'category-chart',
      title: 'Category Breakdown',
      spec: {
        root: 'chart',
        elements: {
          chart: {
            type: 'BarChart',
            props: {
              data: data.byCategory.map(c => ({ category: c.category, count: c.count })),
              x: 'category',
              y: 'count',
            },
            children: []
          }
        }
      }
    })
  }

  // ── Status 饼图 ──
  const statusEntries = Object.entries(data.byStatus)
  if (statusEntries.length > 0) {
    sections.push({
      id: 'status-pie',
      title: 'Status Distribution',
      spec: {
        root: 'pie',
        elements: {
          pie: {
            type: 'PieChart',
            props: {
              data: statusEntries.map(([name, value]) => ({ name, value })),
              label: 'name',
              value: 'value',
            },
            children: []
          }
        }
      }
    })
  }

  // ── Recurrence 热力图（仅在有重复 mistake 时） ──
  const recurCats = data.byCategory.filter(c => c.recurrenceTotal > 0)
  if (recurCats.length > 1) {
    sections.push({
      id: 'recurrence-heat',
      title: 'Recurrence Heatmap',
      spec: {
        root: 'heat',
        elements: {
          heat: {
            type: 'HeatmapChart',
            props: {
              data: recurCats.flatMap(c => [
                { category: c.category, metric: 'Count', value: c.count },
                { category: c.category, metric: 'Recurrence', value: c.recurrenceTotal },
              ]),
              xField: 'category',
              yField: 'metric',
              valueField: 'value',
            },
            children: []
          }
        }
      }
    })
  }

  // ── Recent Mistakes 表格 ──
  if (data.recentMistakes.length > 0) {
    sections.push({
      id: 'mistakes-table',
      title: `Recent Mistakes (${data.recentMistakes.length})`,
      spec: {
        root: 'table',
        elements: {
          table: {
            type: 'DataTable',
            props: {
              columns: [
                { key: 'category', label: 'Category' },
                { key: 'status', label: 'Status' },
                { key: 'detail', label: 'Detail' },
                { key: 'recur', label: 'Recur' },
                { key: 'time', label: 'Time' },
              ],
              data: data.recentMistakes.map(m => ({
                category: m.category,
                status: m.status,
                detail: (m.user_correction || m.ai_misunderstanding || '-').substring(0, 60),
                recur: m.recurrence_count > 1 ? `×${m.recurrence_count}` : '-',
                time: new Date(m.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
              }))
            },
            children: []
          }
        }
      }
    })
  } else {
    sections.push({
      id: 'mistakes-empty',
      title: 'Recent Mistakes',
      spec: {
        root: 'note',
        elements: {
          note: {
            type: 'Note',
            props: { title: 'No mistakes yet', content: 'Start by using correction_capture!', icon: '💡' },
            children: []
          }
        }
      }
    })
  }

  // ── Active Rules 表格 ──
  if (data.rules.length > 0) {
    sections.push({
      id: 'rules-table',
      title: `Active Rules (${data.rules.length})`,
      spec: {
        root: 'rtable',
        elements: {
          rtable: {
            type: 'DataTable',
            props: {
              columns: [
                { key: 'rule', label: 'Rule' },
                { key: 'category', label: 'Category' },
                { key: 'rate', label: 'Pass Rate' },
              ],
              data: data.rules.map(r => ({
                rule: r.rule_text.substring(0, 80),
                category: r.category,
                rate: r.pass_count + r.fail_count > 0
                  ? `${Math.round(r.pass_count / (r.pass_count + r.fail_count) * 100)}% (${r.pass_count}/${r.pass_count + r.fail_count})`
                  : 'unverified',
              }))
            },
            children: []
          }
        }
      }
    })
  } else {
    sections.push({
      id: 'rules-empty',
      title: 'Active Rules',
      spec: {
        root: 'note',
        elements: {
          note: {
            type: 'Note',
            props: { title: 'No rules yet', content: 'Rules are created from recurring mistakes.', icon: '📋' },
            children: []
          }
        }
      }
    })
  }

  return sections
}

// ── HTML 包装器 ──────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function generateHtml(sections: Section[], dbPath: string): string {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  const kpiIds = ['kpi-total', 'kpi-pending', 'kpi-recurring', 'kpi-rules']
  const chartIds = ['category-chart', 'status-pie']

  // KPI 颜色配置
  const kpiColors: Record<string, { accent: string; icon: string }> = {
    'kpi-total':    { accent: '#6366f1', icon: '📊' },
    'kpi-pending':  { accent: '#f59e0b', icon: '⏳' },
    'kpi-recurring':{ accent: '#ef4444', icon: '🔄' },
    'kpi-rules':    { accent: '#10b981', icon: '📐' },
  }

  const kpiCards = kpiIds.map(id => {
    const c = kpiColors[id] ?? { accent: '#6366f1', icon: '📊' }
    return `<div id="${esc(id)}" class="kpi-card" style="--kpi-accent:${c.accent}"></div>`
  }).join('\n  ')

  const chartCards = chartIds
    .filter(id => sections.some(s => s.id === id))
    .map(id => `<div id="${esc(id)}" class="card"></div>`)
    .join('\n    ')

  const otherSections = sections
    .filter(s => !kpiIds.includes(s.id) && !chartIds.includes(s.id))
    .map(sec => {
      const titleHtml = sec.title ? `<h2 class="section-title">${esc(sec.title)}</h2>` : ''
      return `${titleHtml}
  <div id="${esc(sec.id)}" class="card"></div>`
    })
    .join('\n')

  const renderScripts = sections.map(sec => {
    const specJson = JSON.stringify(sec.spec)
    return `Vizual.renderSpec(${specJson}, document.getElementById('${esc(sec.id)}'));`
  }).join('\n  ')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MyBad Dashboard</title>
<style>
  :root {
    --bg: #090a10; --surface: #12141e; --surface2: #1a1d2b; --border: #232840;
    --text: #eaedf3; --text2: #6b7394; --text3: #3d4466;
    --accent: #7c6cf0; --accent2: #a29bfe;
    --green: #34d399; --yellow: #fbbf24; --red: #f87171; --blue: #60a5fa;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 40px 48px; max-width: 1440px; margin: 0 auto; min-height: 100vh; }

  /* ── Header ── */
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
  .header h1 { font-size: 22px; font-weight: 600; color: var(--text2); letter-spacing: 1px; }
  .header h1 em { font-style: normal; color: var(--text); font-weight: 700; font-size: 26px; }
  .header .meta { color: var(--text3); font-size: 12px; text-align: right; line-height: 1.7; }

  /* ── KPI Grid ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 32px; }
  .kpi-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
    padding: 24px; position: relative; overflow: hidden; transition: transform 0.2s, border-color 0.2s;
  }
  .kpi-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--kpi-accent); border-radius: 16px 16px 0 0;
  }
  .kpi-card:hover { transform: translateY(-2px); border-color: var(--kpi-accent); }

  /* ── KPI 内部样式覆盖 ── */
  .kpi-card > div { padding: 0 !important; }
  .kpi-card > div > div:first-child { font-size: 11px !important; text-transform: uppercase;
    letter-spacing: 1.2px; color: var(--text2) !important; margin-bottom: 14px !important; font-weight: 600 !important; }
  .kpi-card > div > div:nth-child(2) { font-size: 40px !important; font-weight: 800 !important; letter-spacing: -1px; }
  .kpi-card > div > div:nth-child(2) > span { color: var(--kpi-accent) !important; }
  .kpi-card > div > div:nth-child(2) > span:last-child { font-size: 14px !important; color: var(--text3) !important; letter-spacing: 0; font-weight: 400; }
  .kpi-card > div > div:last-child { font-size: 12px !important; color: var(--text3) !important; margin-top: 10px !important; }

  /* ── Charts Row ── */
  .charts-row { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 20px; margin-bottom: 32px; }
  .charts-row.single { grid-template-columns: 1fr; }

  /* ── Card ── */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
    padding: 24px; overflow: hidden; }

  /* ── Section Title ── */
  .section-title { font-size: 12px; font-weight: 600; color: var(--text3); margin: 32px 0 12px;
    text-transform: uppercase; letter-spacing: 1.5px; }

  /* ── Table 样式覆盖 ── */
  .card table { width: 100% !important; border-collapse: collapse; }
  .card th { font-size: 11px !important; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--text3) !important; padding: 12px 16px !important;
    border-bottom: 1px solid var(--border) !important; font-weight: 600 !important; }
  .card td { font-size: 13px; padding: 10px 16px !important; border-bottom: 1px solid var(--border) !important;
    color: var(--text2) !important; }
  .card tr:hover td { color: var(--text) !important; background: rgba(124,108,240,0.04); }

  /* ── Note 样式覆盖 ── */
  .card > div > div { background: transparent !important; }

  /* ── Footer ── */
  .footer { text-align: center; color: var(--text3); font-size: 12px; margin-top: 48px; padding-top: 24px;
    border-top: 1px solid var(--border); }
  .footer code { background: var(--surface2); padding: 3px 10px; border-radius: 6px; font-size: 12px;
    border: 1px solid var(--border); color: var(--text2); }

  /* ── Responsive ── */
  @media (max-width: 1024px) {
    body { padding: 24px; }
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .charts-row { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    body { padding: 16px; }
    .kpi-grid { grid-template-columns: 1fr; }
    .header { flex-direction: column; align-items: flex-start; gap: 8px; }
  }
</style>
</head>
<body>
<div class="header">
  <h1><em>MyBad</em> Dashboard</h1>
  <div class="meta">
    <div>${esc(now)}</div>
    <div style="font-family:monospace;font-size:11px">${esc(dbPath)}</div>
  </div>
</div>

<div class="kpi-grid">
  ${kpiCards}
</div>

${chartCards ? `<div class="charts-row${chartIds.filter(id => sections.some(s => s.id === id)).length === 1 ? ' single' : ''}">
  ${chartCards}
</div>` : ''}
${otherSections}
<div class="footer">Run <code>mybad dashboard</code> to refresh</div>
<script src="./vizual.cdn.js"></script>
<script>
  // Vizual standalone 内含 React + ReactDOM + ECharts
  // 使用内置的 echarts 注册暗色主题
  const echarts = Vizual.echarts;
  echarts.registerTheme('mybad', {
    backgroundColor: 'transparent',
    textStyle: { color: '#6b7394', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
    title: { textStyle: { color: '#eaedf3' }, subtextStyle: { color: '#6b7394' } },
    categoryAxis: { axisLine: { lineStyle: { color: '#232840' } }, axisTick: { show: false },
      axisLabel: { color: '#6b7394', fontSize: 11 }, splitLine: { show: false } },
    valueAxis: { axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#3d4466', fontSize: 11 }, splitLine: { lineStyle: { color: '#1a1d2b', type: 'dashed' } } },
    color: ['#7c6cf0','#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa','#22d3ee','#fb923c'],
    tooltip: { backgroundColor: 'rgba(18,20,30,0.95)', borderColor: '#232840', textStyle: { color: '#eaedf3', fontSize: 12 } },
    legend: { textStyle: { color: '#6b7394' } },
  });
  // Monkey-patch echarts.init 强制使用暗色主题
  const _origInit = echarts.init;
  echarts.init = function(dom, theme, opts) { return _origInit.call(this, dom, theme || 'mybad', opts); };

  ${renderScripts}
</script>
</body>
</html>`
}

// ── CLI Command ──────────────────────────────────────────────

export function makeDashboardCommand(): Command {
  return new Command('dashboard')
    .description('生成可视化 Dashboard（在浏览器中打开）')
    .option('-o, --output <path>', '输出 HTML 文件路径')
    .option('--no-open', '不自动打开浏览器')
    .action(async (opts) => {
      const { engine } = getEngine()
      try {
        // 查询数据
        const stats = await engine.getOverallStats()
        const categoryStats = await engine.getCategoryStats()
        const queryResult = await engine.queryMistakes({ limit: 50 })
        const rules = await engine.getRules({ status: 'active', limit: 50 })

        const allMistakes = Array.isArray(queryResult) ? queryResult : []
        const recentMistakes = allMistakes.slice(0, 20).map((m: any) => ({
          id: m.id, category: m.category, status: m.status, trigger_type: m.trigger_type,
          recurrence_count: m.recurrence_count, user_correction: m.user_correction ?? null,
          ai_misunderstanding: m.ai_misunderstanding ?? null, created_at: m.created_at,
        }))
        const rulesList = rules.map((r: any) => ({
          id: r.id, category: r.category, rule_text: r.rule_text, status: r.status,
          pass_count: r.pass_count ?? r.verified_count ?? 0, fail_count: r.fail_count ?? 0,
          created_at: r.created_at,
        }))
        const byCategory = categoryStats.map((c: any) => ({
          category: c.category, count: c.count, recurrenceTotal: c.recurrence_total ?? 0,
        }))

        const data: DashboardData = {
          totalMistakes: stats.total, totalRules: stats.total_rules,
          totalVerifications: stats.total_verifications,
          byStatus: stats.by_status as Record<string, number>,
          byCategory, recentMistakes, rules: rulesList,
        }

        // 构建 sections + 生成 HTML
        const dbPath = process.env.MYBAD_DB_PATH ?? '~/.mybad/mybad.db'
        const sections = buildSections(data)
        const html = generateHtml(sections, dbPath)

        // 写入文件
        const outputDir = join(homedir(), '.mybad')
        const outputHtmlPath = opts.output ?? join(outputDir, 'dashboard.html')
        if (!existsSync(dirname(outputHtmlPath))) mkdirSync(dirname(outputHtmlPath), { recursive: true })
        writeFileSync(outputHtmlPath, html, 'utf-8')

        // 复制 JS 资源（standalone 版本内含 React + ReactDOM + ECharts + mermaid）
        const assetsDir = resolve(__dirname, 'dashboard-assets')
        for (const f of ['vizual.cdn.js']) {
          const src = join(assetsDir, f)
          if (existsSync(src)) copyFileSync(src, join(dirname(outputHtmlPath), f))
        }

        console.log(`Dashboard generated: ${outputHtmlPath}`)

        // 启动 HTTP 服务器
        const PORT = 18765
        const htmlDir = dirname(outputHtmlPath)
        const { readFileSync } = await import('node:fs')

        const server = createServer((req, res) => {
          const url = (req.url || '/').split('?')[0]
          const mimeTypes: Record<string, string> = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript',
          }

          let filePath: string | null = null
          if (url === '/' || url === '/dashboard.html') {
            filePath = outputHtmlPath
          } else if (url.endsWith('.js')) {
            filePath = join(htmlDir, url.slice(1))
          }

          if (filePath && existsSync(filePath)) {
            const ext = filePath.endsWith('.js') ? '.js' : '.html'
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] })
            res.end(readFileSync(filePath))
          } else {
            res.writeHead(404)
            res.end('Not found')
          }
        })

        server.listen(PORT, () => {
          const url = `http://localhost:${PORT}/dashboard.html`
          console.log(`Dashboard: ${url}`)
          if (opts.open !== false) {
            try {
              const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
              execSync(`${cmd} "${url}"`, { stdio: 'ignore' })
              console.log('Opened in browser. Press Ctrl+C to stop.')
            } catch {
              console.log(`Open manually: ${url}`)
            }
          }
        })
      } finally {
        // HTTP server 运行中，不关闭
      }
    })
}
