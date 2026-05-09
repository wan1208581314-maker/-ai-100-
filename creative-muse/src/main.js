import './style.css'
import { initInput } from './input.js'
import { initGraph, addRootNode, clearGraph, getSelectedNodes, expandNode, getZoom, setZoom, fitToView, resetView, exportGraphState, importGraphState } from './graph.js'
import { initHistory, addHistory, updateLatestHistory, setHistoryRestoreCallback } from './history.js'
import { initGenerator } from './generator.js'
import { fetchAssociations } from './api.js'

const app = document.getElementById('app')

// ── 背景网格 ──
const bgGrid = document.createElement('div')
bgGrid.className = 'bg-grid'
app.appendChild(bgGrid)

// ── 画布变换容器（包裹 SVG 连线层 + 图谱节点层）──
const transformContainer = document.createElement('div')
transformContainer.className = 'canvas-transform'
app.appendChild(transformContainer)

// ── SVG 连线层 ──
const svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
svgLayer.classList.add('connections-layer')
svgLayer.setAttribute('width', '100%')
svgLayer.setAttribute('height', '100%')
transformContainer.appendChild(svgLayer)

// ── 图谱节点层 ──
const graphLayer = document.createElement('div')
graphLayer.className = 'graph-layer'
transformContainer.appendChild(graphLayer)

// ── 空白欢迎状态 ──
const emptyState = document.createElement('div')
emptyState.className = 'empty-state'
emptyState.innerHTML = `
  <div class="empty-icon">&#10024;</div>
  <h2>创意发散</h2>
  <p>输入一个词，开始探索无限可能</p>
  <span class="empty-hint">点击节点展开联想 · 右键选择词语 · 空白处拖拽平移</span>
`
app.appendChild(emptyState)

// ── 暗色模式 ──
const THEME_KEY = 'creative-muse-theme'
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  themeBtn.innerHTML = theme === 'dark' ? '&#9728;' : '&#9790;'
}

const themeBtn = document.createElement('button')
themeBtn.className = 'theme-toggle'
themeBtn.title = '切换主题'
app.appendChild(themeBtn)

applyTheme(localStorage.getItem(THEME_KEY) || 'light')
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  localStorage.setItem(THEME_KEY, next)
})

// ── 画布控件 ──
const controls = document.createElement('div')
controls.className = 'canvas-controls'
controls.innerHTML = `
  <button class="ctrl-btn" data-action="zoom-in" title="放大">+</button>
  <button class="ctrl-btn" data-action="zoom-out" title="缩小">&minus;</button>
  <button class="ctrl-btn" data-action="fit" title="适应画面">&#9634;</button>
  <button class="ctrl-btn" data-action="clear" title="清空画布">&#128465;</button>
  <div class="zoom-indicator"></div>
`
app.appendChild(controls)

// ── 版本号 ──
const versionTag = document.createElement('div')
versionTag.className = 'version-tag'
versionTag.textContent = 'v2.2'
versionTag.title = '创意发散 v2.2 — 详见项目日志.md'
app.appendChild(versionTag)

const zoomIndicator = controls.querySelector('.zoom-indicator')
function updateZoomIndicator() {
  zoomIndicator.textContent = `${Math.round(getZoom() * 100)}%`
}

controls.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]')
  if (!btn) return
  const action = btn.dataset.action
  if (action === 'zoom-in') setZoom(getZoom() * 1.25)
  else if (action === 'zoom-out') setZoom(getZoom() / 1.25)
  else if (action === 'fit') fitToView()
  else if (action === 'clear') {
    clearGraph()
    resetView()
    emptyState.classList.remove('hidden')
    currentWord = null
  }
  updateZoomIndicator()
})

// ── 初始化图谱（传入变换容器）──
let generatorApi = null
let currentWord = null
initGraph(graphLayer, svgLayer, transformContainer, (selected) => {
  if (generatorApi) generatorApi.updateSelection(selected)
}, () => {
  if (currentWord) updateLatestHistory(exportGraphState(), currentWord)
})

// ── 初始化输入框 ──
const inputApi = initInput(async (word) => {
  clearGraph()
  resetView()
  emptyState.classList.add('hidden')
  currentWord = word

  const root = addRootNode({ zh: word, en: '...' })

  try {
    const words = await fetchAssociations(word)
    const match = words.find(w => w.zh === word)
    if (match) {
      const el = graphLayer.querySelector(`[data-id="${root.id}"] .en`)
      if (el) el.textContent = match.en
      root.en = match.en
    }
    expandNode(root.id, words)
    updateZoomIndicator()
    addHistory(word, exportGraphState())
  } catch (err) {
    console.error('联想失败:', err)
  }
})

// ── 初始化历史记录 ──
initHistory()
setHistoryRestoreCallback(async (word, graphData) => {
  resetView()
  emptyState.classList.add('hidden')
  currentWord = word
  inputApi.dock()

  if (graphData) {
    importGraphState(graphData)
  } else {
    clearGraph()
    const root = addRootNode({ zh: word, en: '...' })
    try {
      const words = await fetchAssociations(word)
      const match = words.find(w => w.zh === word)
      if (match) {
        const el = graphLayer.querySelector(`[data-id="${root.id}"] .en`)
        if (el) el.textContent = match.en
        root.en = match.en
      }
      expandNode(root.id, words)
    } catch (err) {
      console.error('联想失败:', err)
    }
  }
})

// ── 初始化创意生成器 ──
generatorApi = initGenerator(() => getSelectedNodes())
