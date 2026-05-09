const STORAGE_KEY = 'creative-muse-history'

export function initHistory() {
  const app = document.getElementById('app')

  // 历史按钮
  const btn = document.createElement('button')
  btn.className = 'history-btn'
  btn.innerHTML = '&#9776;'
  btn.title = '历史记录'
  app.appendChild(btn)

  // 遮罩
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  app.appendChild(overlay)

  // 抽屉
  const drawer = document.createElement('div')
  drawer.className = 'history-drawer'
  drawer.innerHTML = `
    <div class="drawer-header">
      <h2>历史记录</h2>
      <button class="close-btn">&#10005;</button>
    </div>
    <div class="history-list"></div>
  `
  app.appendChild(drawer)

  const closeBtn = drawer.querySelector('.close-btn')
  const list = drawer.querySelector('.history-list')

  function open() {
    drawer.classList.add('open')
    overlay.classList.add('visible')
    renderList()
  }

  function close() {
    drawer.classList.remove('open')
    overlay.classList.remove('visible')
  }

  btn.addEventListener('click', open)
  closeBtn.addEventListener('click', close)
  overlay.addEventListener('click', close)

  function renderList() {
    const history = getHistory()
    if (history.length === 0) {
      list.innerHTML = '<div class="history-empty">暂无历史记录</div>'
      return
    }
    list.innerHTML = history.map((item, i) => `
      <div class="history-item" data-index="${i}">
        <div>
          <div class="hi-word">${item.word}</div>
          <div class="hi-time">${formatTime(item.time)}</div>
        </div>
        <button class="hi-delete" data-index="${i}">删除</button>
      </div>
    `).join('')

    list.querySelectorAll('.hi-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        deleteHistory(parseInt(btn.dataset.index))
        renderList()
      })
    })

    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index)
        const h = getHistory()[idx]
        if (h && onRestore) onRestore(h.word, h.graph)
        close()
      })
    })
  }
}

let onRestore = null
export function setHistoryRestoreCallback(cb) {
  onRestore = cb
}

export function addHistory(word, graphState) {
  const history = getHistory()
  const entry = { word, time: Date.now() }
  if (graphState) entry.graph = graphState
  history.unshift(entry)
  if (history.length > 50) history.pop()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

export function updateLatestHistory(graphState, word) {
  const history = getHistory()
  if (history.length === 0) return
  if (word && history[0].word !== word) return
  history[0].graph = graphState
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function deleteHistory(index) {
  const history = getHistory()
  history.splice(index, 1)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

function formatTime(ts) {
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
