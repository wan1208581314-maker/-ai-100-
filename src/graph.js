import { fetchAssociations } from './api.js'

// 节点和连线数据
let nodes = []
let edges = []
let nodeIdCounter = 0
let selectedNodes = new Set()

// 撤销栈
let undoStack = []

// DOM 引用
let graphLayer = null
let svgLayer = null
let transformContainer = null

// 平移缩放状态
let panX = 0
let panY = 0
let zoom = 1
let isPanning = false
let panStartX = 0
let panStartY = 0
let panStartPanX = 0
let panStartPanY = 0

// 拖拽状态
let dragNode = null
let dragOffsetX = 0
let dragOffsetY = 0
let dragMoved = false

// 回调
let onSelectionChange = null

// 确认按钮状态
let confirmTarget = null

function screenToWorld(sx, sy) {
  return {
    x: (sx - panX) / zoom,
    y: (sy - panY) / zoom,
  }
}

function applyTransform() {
  transformContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`
  transformContainer.style.transformOrigin = '0 0'
}

export function initGraph(graphEl, svgEl, transformEl, onSelChange) {
  graphLayer = graphEl
  svgLayer = svgEl
  transformContainer = transformEl
  onSelectionChange = onSelChange

  // 平移：在空白区域按下鼠标
  transformContainer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    if (e.target !== graphLayer && e.target !== svgLayer && !e.target.closest('svg.connections-layer')) return
    removeConfirmIcon()
    isPanning = true
    panStartX = e.clientX
    panStartY = e.clientY
    panStartPanX = panX
    panStartPanY = panY
    transformContainer.style.cursor = 'grabbing'
    e.preventDefault()
  })

  // 缩放：鼠标滚轮
  transformContainer.addEventListener('wheel', (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    const newZoom = Math.min(Math.max(zoom * delta, 0.2), 5)
    const rect = transformContainer.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    panX = mx - (mx - panX) * (newZoom / zoom)
    panY = my - (my - panY) * (newZoom / zoom)
    zoom = newZoom
    applyTransform()
  }, { passive: false })

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  window.addEventListener('resize', () => renderEdges())

  // Ctrl+Z / Cmd+Z undo
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      undo()
    }
  })
}

export function getSelectedNodes() {
  return nodes.filter(n => selectedNodes.has(n.id))
}

export function addRootNode(word) {
  const cx = (window.innerWidth / 2 - panX) / zoom
  const cy = (window.innerHeight / 2 - panY) / zoom
  const node = createNodeData(word, cx, cy, null, true)
  nodes.push(node)
  renderNode(node)
  return node
}

export function expandNode(parentId, words) {
  const parent = nodes.find(n => n.id === parentId)
  if (!parent) return

  // Filter out duplicates
  words = words.filter(w => !nodes.some(n => n.zh === w.zh))
  if (words.length === 0) return

  const count = words.length
  const baseAngle = Math.random() * Math.PI * 2
  const radius = 180
  const newNodes = []

  words.forEach((word, i) => {
    const angle = baseAngle + (2 * Math.PI * i) / count + (Math.random() - 0.5) * 0.3
    const r = radius + (Math.random() - 0.5) * 40
    const x = parent.x + Math.cos(angle) * r
    const y = parent.y + Math.sin(angle) * r

    const node = createNodeData(word, x, y, parentId, false)
    node._angle = angle
    node._parentX = parent.x
    node._parentY = parent.y
    nodes.push(node)
    newNodes.push(node)
    edges.push({ from: parentId, to: node.id })
  })

  // Resolve collisions so new nodes don't overlap existing ones
  resolveCollisions(newNodes)

  newNodes.forEach(node => {
    delete node._angle
    delete node._parentX
    delete node._parentY
    renderNode(node)
  })

  // Push to undo stack
  undoStack.push({
    nodeIds: newNodes.map(n => n.id),
    parentId: parentId,
  })

  renderEdges()
}

function resolveCollisions(newNodes) {
  const minDist = 130
  const allNodes = nodes

  for (let iter = 0; iter < 3; iter++) {
    let moved = false
    for (const node of newNodes) {
      for (const other of allNodes) {
        if (other.id === node.id) continue
        const dx = node.x - other.x
        const dy = node.y - other.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < minDist && dist > 0) {
          const overlap = minDist - dist
          const angle = node._angle || Math.atan2(dy, dx)
          node.x += Math.cos(angle) * overlap * 0.6
          node.y += Math.sin(angle) * overlap * 0.6
          moved = true
        }
      }
    }
    if (!moved) break
  }
}

function createNodeData(word, x, y, parentId, isRoot) {
  return {
    id: ++nodeIdCounter,
    zh: word.zh,
    en: word.en,
    x,
    y,
    parentId,
    isRoot,
    collapsed: false,
    floatClass: `floating-${(Math.floor(Math.random() * 3)) + 1}`,
  }
}

function renderNode(node) {
  const el = document.createElement('div')
  el.className = `node ${node.floatClass}${node.isRoot ? ' large root-node' : ''} entering`
  el.dataset.id = node.id

  el.innerHTML = `
    <span class="zh">${node.zh}</span>
    <span class="en">${node.en}</span>
  `

  // 预估尺寸定位
  const estSize = node.isRoot ? 120 : 90
  el.style.left = `${node.x - estSize / 2}px`
  el.style.top = `${node.y - estSize / 2}px`

  // tooltip
  el.title = node.zh + (node.en ? ` (${node.en})` : '')

  // 点击显示确认按钮
  el.addEventListener('click', (e) => {
    if (dragMoved) return
    showConfirmIcon(node, el)
  })

  // 右键选择
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    toggleSelection(node, el)
  })

  // 拖拽（使用世界坐标偏移）
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const world = screenToWorld(e.clientX, e.clientY)
    dragNode = { node, el }
    dragOffsetX = world.x - node.x
    dragOffsetY = world.y - node.y
    dragMoved = false
    el.classList.add('dragging')
  })

  graphLayer.appendChild(el)

  el.addEventListener('animationend', () => {
    el.classList.remove('entering')
  }, { once: true })

  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect()
    el.style.left = `${node.x - rect.width / 2}px`
    el.style.top = `${node.y - rect.height / 2}px`
  })
}

function renderEdges() {
  svgLayer.innerHTML = ''
  const visibleIds = new Set(nodes.filter(n => !isHidden(n.id)).map(n => n.id))

  edges.forEach(edge => {
    const from = nodes.find(n => n.id === edge.from)
    const to = nodes.find(n => n.id === edge.to)
    if (!from || !to) return
    if (!visibleIds.has(from.id) || !visibleIds.has(to.id)) return

    const dx = to.x - from.x
    const dy = to.y - from.y
    const cx = (from.x + to.x) / 2 - dy * 0.12
    const cy = (from.y + to.y) / 2 + dx * 0.12

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`)
    svgLayer.appendChild(path)
  })
}

function isHidden(nodeId) {
  let current = nodes.find(n => n.id === nodeId)
  while (current && current.parentId) {
    const parent = nodes.find(n => n.id === current.parentId)
    if (parent && parent.collapsed) return true
    current = parent
  }
  return false
}

function updateNodePosition(node) {
  const el = graphLayer.querySelector(`[data-id="${node.id}"]`)
  if (!el) return
  el.style.left = `${node.x - el.offsetWidth / 2}px`
  el.style.top = `${node.y - el.offsetHeight / 2}px`
}

function onMouseMove(e) {
  // 画布平移
  if (isPanning) {
    panX = panStartPanX + (e.clientX - panStartX)
    panY = panStartPanY + (e.clientY - panStartY)
    applyTransform()
    return
  }

  // 节点拖拽
  if (!dragNode) return
  dragMoved = true
  const { node, el } = dragNode
  const world = screenToWorld(e.clientX, e.clientY)
  node.x = world.x - dragOffsetX
  node.y = world.y - dragOffsetY
  el.style.left = `${node.x - el.offsetWidth / 2}px`
  el.style.top = `${node.y - el.offsetHeight / 2}px`
  renderEdges()
}

function onMouseUp() {
  if (isPanning) {
    isPanning = false
    transformContainer.style.cursor = ''
    return
  }
  if (dragNode) {
    dragNode.el.classList.remove('dragging')
    dragNode = null
  }
}

function showConfirmIcon(node, nodeEl) {
  // Remove existing confirm icon if clicking same node
  if (confirmTarget && confirmTarget.el === nodeEl) {
    removeConfirmIcon()
    return
  }
  removeConfirmIcon()

  const icon = document.createElement('div')
  icon.className = 'confirm-icon'
  icon.title = '点击展开联想'

  icon.addEventListener('click', (e) => {
    e.stopPropagation()
    removeConfirmIcon()
    handleNodeExpand(node, nodeEl)
  })

  nodeEl.appendChild(icon)
  confirmTarget = { node, el: nodeEl, icon }

  // Dismiss on outside click
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDismissConfirm, { once: true })
  }, 0)
}

function onDocDismissConfirm(e) {
  if (confirmTarget && !confirmTarget.el.contains(e.target)) {
    removeConfirmIcon()
  } else if (confirmTarget) {
    // Still listening if clicked on the node itself (handled by showConfirmIcon toggle)
    document.addEventListener('mousedown', onDocDismissConfirm, { once: true })
  }
}

function removeConfirmIcon() {
  if (confirmTarget) {
    confirmTarget.icon.remove()
    confirmTarget = null
  }
}

async function handleNodeExpand(node, nodeEl) {
  // 防止重复点击
  if (nodeEl.querySelector('.loader')) return

  const loader = document.createElement('div')
  loader.className = 'loader'
  nodeEl.appendChild(loader)

  try {
    const existing = nodes.map(n => n.zh)
    const words = await fetchAssociations(node.zh, existing)
    expandNode(node.id, words)
    updateNodeBadge(node)
  } catch (err) {
    console.error('联想失败:', err)
  } finally {
    loader.remove()
  }
}

function updateNodeBadge(node) {
  const el = graphLayer.querySelector(`[data-id="${node.id}"]`)
  if (!el) return
  let badge = el.querySelector('.node-badge')
  const childCount = edges.filter(e => e.from === node.id).length
  if (childCount === 0) {
    if (badge) badge.remove()
    return
  }
  if (!badge) {
    badge = document.createElement('span')
    badge.className = 'node-badge'
    el.appendChild(badge)
  }
  badge.textContent = childCount
}

function updateCollapseState() {
  nodes.forEach(node => {
    const el = graphLayer.querySelector(`[data-id="${node.id}"]`)
    if (!el) return
    const hidden = isHidden(node.id)
    el.classList.toggle('hidden', hidden)
  })
  renderEdges()
}

function toggleSelection(node, el) {
  if (selectedNodes.has(node.id)) {
    selectedNodes.delete(node.id)
    el.classList.remove('selected')
  } else {
    selectedNodes.add(node.id)
    el.classList.add('selected')
  }
  if (onSelectionChange) onSelectionChange(getSelectedNodes())
}

// -- 画布控制 API --

export function getZoom() { return zoom }
export function getPan() { return { x: panX, y: panY } }

export function setZoom(newZoom, cx, cy) {
  const rect = transformContainer.getBoundingClientRect()
  const mx = cx ?? rect.width / 2
  const my = cy ?? rect.height / 2
  const clamped = Math.min(Math.max(newZoom, 0.2), 5)
  panX = mx - (mx - panX) * (clamped / zoom)
  panY = my - (my - panY) * (clamped / zoom)
  zoom = clamped
  applyTransform()
}

export function setPan(x, y) {
  panX = x
  panY = y
  applyTransform()
}

export function fitToView() {
  if (nodes.length === 0) {
    panX = 0; panY = 0; zoom = 1
    applyTransform()
    return
  }
  const minX = Math.min(...nodes.map(n => n.x)) - 120
  const maxX = Math.max(...nodes.map(n => n.x)) + 120
  const minY = Math.min(...nodes.map(n => n.y)) - 120
  const maxY = Math.max(...nodes.map(n => n.y)) + 120
  const worldW = maxX - minX
  const worldH = maxY - minY
  const screenW = window.innerWidth
  const screenH = window.innerHeight
  zoom = Math.min(screenW / worldW, screenH / worldH, 2)
  panX = (screenW - worldW * zoom) / 2 - minX * zoom
  panY = (screenH - worldH * zoom) / 2 - minY * zoom
  applyTransform()
}

export function resetView() {
  panX = 0; panY = 0; zoom = 1
  applyTransform()
}

// 清空图谱
export function clearGraph() {
  removeConfirmIcon()
  nodes = []
  edges = []
  selectedNodes.clear()
  undoStack = []
  nodeIdCounter = 0
  graphLayer.innerHTML = ''
  svgLayer.innerHTML = ''
  if (onSelectionChange) onSelectionChange([])
}

// 撤销上一次展开
export function undo() {
  if (undoStack.length === 0) return

  const action = undoStack.pop()

  // Remove edges that connect to the removed nodes
  edges = edges.filter(e => !action.nodeIds.includes(e.to))

  // Remove nodes from data and DOM
  action.nodeIds.forEach(id => {
    const idx = nodes.findIndex(n => n.id === id)
    if (idx !== -1) nodes.splice(idx, 1)
    const el = graphLayer.querySelector(`[data-id="${id}"]`)
    if (el) el.remove()
    selectedNodes.delete(id)
  })

  // Update badge on parent node
  const parentNode = nodes.find(n => n.id === action.parentId)
  if (parentNode) updateNodeBadge(parentNode)

  renderEdges()
  if (onSelectionChange) onSelectionChange(getSelectedNodes())
}
