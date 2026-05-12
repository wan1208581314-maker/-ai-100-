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
let dragStartClientX = 0
let dragStartClientY = 0
const DRAG_THRESHOLD = 6

// 触摸状态
let activePointers = new Map()
let pinchStartDistance = 0
let pinchStartZoom = 1
let pinchStartWorld = null

// 弹簧物理状态
let springChildren = null // { parentId, children: [{id, relX, relY, curX, curY, el}] }

// 回调
let onSelectionChange = null
let onGraphChange = null

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
  window.dispatchEvent(new CustomEvent('graph:viewchange', {
    detail: { zoom, pan: { x: panX, y: panY } },
  }))
}

function clampZoom(value) {
  return Math.min(Math.max(value, 0.2), 5)
}

function getPointerDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function getPointerMidpoint(a, b) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  }
}

function resetPinchState() {
  pinchStartDistance = 0
  pinchStartWorld = null
}

function updatePointer(e) {
  if (!activePointers.has(e.pointerId)) return
  activePointers.set(e.pointerId, {
    clientX: e.clientX,
    clientY: e.clientY,
  })
}

function beginPinchIfNeeded() {
  if (activePointers.size < 2 || pinchStartDistance > 0) return
  const [a, b] = [...activePointers.values()]
  const midpoint = getPointerMidpoint(a, b)
  pinchStartDistance = getPointerDistance(a, b)
  pinchStartZoom = zoom
  pinchStartWorld = screenToWorld(midpoint.x, midpoint.y)
  isPanning = false
  if (dragNode) {
    dragNode.el.classList.remove('dragging')
    dragNode = null
  }
}

function handlePinchZoom() {
  if (activePointers.size < 2 || !pinchStartWorld || pinchStartDistance === 0) return false
  const [a, b] = [...activePointers.values()]
  const distance = getPointerDistance(a, b)
  if (distance === 0) return true
  const midpoint = getPointerMidpoint(a, b)
  zoom = clampZoom(pinchStartZoom * (distance / pinchStartDistance))
  panX = midpoint.x - pinchStartWorld.x * zoom
  panY = midpoint.y - pinchStartWorld.y * zoom
  applyTransform()
  return true
}

function getAllDescendants(parentId) {
  const result = []
  const stack = [parentId]
  while (stack.length > 0) {
    const pid = stack.pop()
    edges.forEach(e => {
      if (e.from === pid) {
        const child = nodes.find(n => n.id === e.to)
        if (child) {
          result.push(child)
          stack.push(child.id)
        }
      }
    })
  }
  return result
}

// ── 弹簧物理（直接移动，不依赖 requestAnimationFrame） ──

function startSpring(draggedId) {
  clearSpring()

  const parent = nodes.find(n => n.id === draggedId)
  if (!parent) return

  const descendants = getAllDescendants(draggedId)
  if (descendants.length === 0) return

  const children = descendants.map((child, i) => {
    const el = graphLayer.querySelector(`[data-id="${child.id}"]`)
    if (!el) return null
    el.style.animation = 'none'
    el.classList.add('spring-active')

    let depth = 0
    let cur = child
    while (cur.parentId && cur.parentId !== draggedId) {
      cur = nodes.find(n => n.id === cur.parentId) || cur
      depth++
    }

    const r1 = Math.random()
    const r2 = Math.random()
    const r3 = Math.random()
    return {
      id: child.id,
      relX: child.x - parent.x,
      relY: child.y - parent.y,
      curX: child.x,
      curY: child.y,
      baseX: child.x,
      baseY: child.y,
      el,
      depth,
      // 每个节点独立的飘动参数
      phase1: r1 * Math.PI * 2,
      phase2: r2 * Math.PI * 2,
      phase3: r3 * Math.PI * 2,
      freq1: 0.002 + r1 * 0.002,
      freq2: 0.003 + r2 * 0.002,
      freq3: 0.001 + r3 * 0.0015,
      amp1: 5 + depth * 3 + r1 * 5,
      amp2: 3 + r2 * 4,
      amp3: 2 + depth * 2 + r3 * 3,
      // 柔和跟随：每个节点不同的跟随速度
      followSpeed: 0.15 - depth * 0.03 + r1 * 0.04,  // 0.12~0.19
    }
  }).filter(Boolean)

  if (children.length === 0) return

  springChildren = { parentId: draggedId, children }
}

function updateSpring() {
  if (!springChildren) return

  const parent = nodes.find(n => n.id === springChildren.parentId)
  if (!parent) return

  const t = performance.now()

  springChildren.children.forEach(sc => {
    const node = nodes.find(n => n.id === sc.id)
    if (!node) return

    // 目标：父节点当前位置 + 初始相对偏移
    const targetX = parent.x + sc.relX
    const targetY = parent.y + sc.relY

    // 柔和 lerp 跟随（每个节点速度不同 → 参差不齐的跟随感）
    sc.curX += (targetX - sc.curX) * sc.followSpeed
    sc.curY += (targetY - sc.curY) * sc.followSpeed

    // 飘动叠加
    const driftX = Math.sin(t * sc.freq1 + sc.phase1) * sc.amp1
                  + Math.sin(t * sc.freq2 + sc.phase2) * sc.amp2
                  + Math.sin(t * sc.freq3 + sc.phase3) * sc.amp3
    const driftY = Math.cos(t * sc.freq1 * 1.3 + sc.phase1 + 1) * sc.amp1
                  + Math.cos(t * sc.freq2 * 0.8 + sc.phase2 + 2) * sc.amp2
                  + Math.cos(t * sc.freq3 * 1.7 + sc.phase3 + 3) * sc.amp3

    node.x = sc.curX + driftX
    node.y = sc.curY + driftY
    sc.el.style.transform = `translate(${node.x - sc.baseX}px, ${node.y - sc.baseY}px)`
  })

  renderEdges()
}

function commitSpring() {
  if (!springChildren) return
  springChildren.children.forEach(sc => {
    const node = nodes.find(n => n.id === sc.id)
    if (node) {
      node.x = sc.curX
      node.y = sc.curY
    }
    sc.el.style.transform = ''
    sc.el.style.animation = ''
    sc.el.classList.remove('spring-active')
    if (node) updateNodePosition(node)
  })
  springChildren = null
  if (onGraphChange) onGraphChange()
}

function clearSpring() {
  if (springChildren) {
    springChildren.children.forEach(sc => {
      sc.el.style.transform = ''
      sc.el.style.animation = ''
      sc.el.classList.remove('spring-active')
    })
    springChildren = null
  }
}

// ── 事件处理 ──

function moveInteraction(clientX, clientY) {
  if (isPanning) {
    panX = panStartPanX + (clientX - panStartX)
    panY = panStartPanY + (clientY - panStartY)
    applyTransform()
    return
  }

  if (!dragNode) return
  const { node, el } = dragNode
  if (!dragMoved) {
    const moved = Math.hypot(clientX - dragStartClientX, clientY - dragStartClientY)
    if (moved < DRAG_THRESHOLD) return
    dragMoved = true
  }
  const world = screenToWorld(clientX, clientY)
  node.x = world.x - dragOffsetX
  node.y = world.y - dragOffsetY
  el.style.left = `${node.x - el.offsetWidth / 2}px`
  el.style.top = `${node.y - el.offsetHeight / 2}px`

  // 启动弹簧（首次拖拽时）
  if (!springChildren || springChildren.parentId !== node.id) {
    startSpring(node.id)
  }
  // 更新弹簧中子节点位置
  updateSpring()

  renderEdges()
}

function endInteraction() {
  if (isPanning) {
    isPanning = false
    document.body.style.cursor = ''
    return
  }
  if (dragNode) {
    // 提交弹簧中子节点的最终位置
    commitSpring()
    dragNode.el.classList.remove('dragging')
    dragNode = null
  }
}

function shouldIgnoreCanvasTarget(target) {
  return target.closest('.input-area, .canvas-controls, .theme-toggle, .history-btn, .history-drawer, .generate-btn, .result-modal, .selection-badge, .overlay, .global-loading')
}

function onPointerMove(e) {
  updatePointer(e)
  if (activePointers.size >= 2) {
    e.preventDefault()
    beginPinchIfNeeded()
    if (handlePinchZoom()) return
  }
  moveInteraction(e.clientX, e.clientY)
}

function onPointerUp(e) {
  activePointers.delete(e.pointerId)
  if (activePointers.size < 2) resetPinchState()
  endInteraction()
}

// ── 初始化 ──

export function initGraph(graphEl, svgEl, transformEl, onSelChange, onGraphUpdate) {
  graphLayer = graphEl
  svgLayer = svgEl
  transformContainer = transformEl
  onSelectionChange = onSelChange
  onGraphChange = onGraphUpdate

  // 画布事件绑定在 document，用排除法过滤 UI 控件和节点
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    if (shouldIgnoreCanvasTarget(e.target)) return
    if (e.target.closest('.node')) return

    removeConfirmIcon()
    activePointers.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
    })
    beginPinchIfNeeded()
    if (activePointers.size >= 2) {
      e.preventDefault()
      return
    }

    isPanning = true
    panStartX = e.clientX
    panStartY = e.clientY
    panStartPanX = panX
    panStartPanY = panY
    document.body.style.cursor = 'grabbing'
    e.preventDefault()
  }, { capture: true })

  document.addEventListener('wheel', (e) => {
    if (e.target.closest('.input-area, .canvas-controls, .history-drawer, .result-modal, .generate-btn')) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    const newZoom = clampZoom(zoom * delta)
    const mx = e.clientX
    const my = e.clientY
    panX = mx - (mx - panX) * (newZoom / zoom)
    panY = my - (my - panY) * (newZoom / zoom)
    zoom = newZoom
    applyTransform()
  }, { passive: false })

  document.addEventListener('pointermove', onPointerMove, { passive: false })
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('resize', () => renderEdges())

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      undo()
    }
  })
}

// ── 导出 API ──

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
    nodes.push(node)
    newNodes.push(node)
    edges.push({ from: parentId, to: node.id })
  })

  resolveCollisions(newNodes)

  newNodes.forEach(node => {
    delete node._angle
    renderNode(node)
  })

  undoStack.push({
    nodeIds: newNodes.map(n => n.id),
    parentId: parentId,
  })

  renderEdges()
  if (onGraphChange) onGraphChange()
}

function resolveCollisions(newNodes) {
  const minDist = 130
  for (let iter = 0; iter < 3; iter++) {
    let moved = false
    for (const node of newNodes) {
      for (const other of nodes) {
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
    x, y, parentId, isRoot,
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

  const size = node.isRoot ? 120 : 90
  el.style.left = `${node.x - size / 2}px`
  el.style.top = `${node.y - size / 2}px`
  el.style.width = `${size}px`
  el.style.height = `${size}px`

  el.title = node.zh + (node.en ? ` (${node.en})` : '')

  el.addEventListener('click', () => {
    if (dragMoved) return
    showConfirmIcon(node, el)
  })

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    toggleSelection(node, el)
  })

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    activePointers.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
    })
    beginPinchIfNeeded()
    if (activePointers.size >= 2) {
      e.preventDefault()
      return
    }

    el.setPointerCapture(e.pointerId)
    const world = screenToWorld(e.clientX, e.clientY)
    dragNode = { node, el }
    dragStartClientX = e.clientX
    dragStartClientY = e.clientY
    dragOffsetX = world.x - node.x
    dragOffsetY = world.y - node.y
    dragMoved = false
    el.classList.add('dragging')
  })

  graphLayer.appendChild(el)

  el.addEventListener('animationend', () => {
    el.classList.remove('entering')
  }, { once: true })
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

function showConfirmIcon(node, nodeEl) {
  if (confirmTarget && confirmTarget.el === nodeEl) {
    removeConfirmIcon()
    return
  }
  removeConfirmIcon()

  const icon = document.createElement('div')
  icon.className = 'confirm-icon'
  icon.title = '点击展开联想'

  icon.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  icon.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    removeConfirmIcon()
    handleNodeExpand(node, nodeEl)
  })

  nodeEl.appendChild(icon)
  confirmTarget = { node, el: nodeEl, icon }

  setTimeout(() => {
    document.addEventListener('mousedown', onDocDismissConfirm, { once: true })
  }, 0)
}

function onDocDismissConfirm(e) {
  if (confirmTarget && !confirmTarget.el.contains(e.target)) {
    removeConfirmIcon()
  } else if (confirmTarget) {
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
    alert(err.message || '联想失败，请稍后重试')
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
    badge.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleCollapse(node)
    })
    el.appendChild(badge)
  }
  badge.textContent = node.collapsed ? childCount + ' ▸' : childCount
  badge.classList.toggle('collapsed', node.collapsed)
}

function updateCollapseState() {
  nodes.forEach(node => {
    const el = graphLayer.querySelector(`[data-id="${node.id}"]`)
    if (!el) return
    el.classList.toggle('hidden', isHidden(node.id))
  })
  renderEdges()
}

function toggleCollapse(node) {
  const childCount = edges.filter(e => e.from === node.id).length
  if (childCount === 0) return
  node.collapsed = !node.collapsed
  updateCollapseState()
  updateNodeBadge(node)
  if (onGraphChange) onGraphChange()
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

export function exportGraphState() {
  return {
    nodes: nodes.map(n => ({ ...n })),
    edges: edges.map(e => ({ ...e })),
    nodeIdCounter,
  }
}

export function importGraphState(state) {
  clearGraph()
  if (!state) return
  nodeIdCounter = state.nodeIdCounter || 0
  state.edges.forEach(e => edges.push({ ...e }))
  state.nodes.forEach(n => {
    nodes.push(n)
    renderNode(n)
    updateNodeBadge(n)
  })
  renderEdges()
}

export function clearGraph() {
  removeConfirmIcon()
  clearSpring()
  nodes = []
  edges = []
  selectedNodes.clear()
  undoStack = []
  nodeIdCounter = 0
  graphLayer.innerHTML = ''
  svgLayer.innerHTML = ''
  if (onSelectionChange) onSelectionChange([])
}

export function undo() {
  if (undoStack.length === 0) return

  const action = undoStack.pop()
  removeConfirmIcon()

  edges = edges.filter(e => !action.nodeIds.includes(e.to))

  action.nodeIds.forEach(id => {
    const idx = nodes.findIndex(n => n.id === id)
    if (idx !== -1) nodes.splice(idx, 1)
    const el = graphLayer.querySelector(`[data-id="${id}"]`)
    if (el) el.remove()
    selectedNodes.delete(id)
  })

  const parentNode = nodes.find(n => n.id === action.parentId)
  if (parentNode) {
    const remaining = edges.filter(e => e.from === parentNode.id).length
    if (remaining === 0) parentNode.collapsed = false
    updateNodeBadge(parentNode)
  }

  renderEdges()
  if (onSelectionChange) onSelectionChange(getSelectedNodes())
  if (onGraphChange) onGraphChange()
}
