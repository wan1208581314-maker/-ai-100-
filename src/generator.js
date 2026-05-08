import { fetchCreativeIdeas } from './api.js'

export function initGenerator(getSelectedWords) {
  const app = document.getElementById('app')

  // 选中计数
  const badge = document.createElement('div')
  badge.className = 'selection-badge'
  app.appendChild(badge)

  // 生成按钮
  const btn = document.createElement('button')
  btn.className = 'generate-btn'
  btn.textContent = '生成创意'
  btn.disabled = true
  app.appendChild(btn)

  // 加载提示
  const loading = document.createElement('div')
  loading.className = 'global-loading'
  loading.innerHTML = '<div class="spinner"></div><span>正在生成创意方案...</span>'
  app.appendChild(loading)

  // 结果弹窗
  const modal = document.createElement('div')
  modal.className = 'result-modal'
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2>创意方案</h2>
        <button class="modal-close">&#10005;</button>
      </div>
      <div class="modal-tags"></div>
      <div class="modal-body"></div>
    </div>
  `
  app.appendChild(modal)

  const modalBackdrop = modal.querySelector('.modal-backdrop')
  const modalClose = modal.querySelector('.modal-close')
  const modalTags = modal.querySelector('.modal-tags')
  const modalBody = modal.querySelector('.modal-body')

  modalBackdrop.addEventListener('click', closeModal)
  modalClose.addEventListener('click', closeModal)

  function closeModal() {
    modal.classList.remove('open')
  }

  // 更新选中状态
  function updateSelection(selectedNodes) {
    const count = selectedNodes.length
    badge.textContent = `已选 ${count} 个词`
    badge.classList.toggle('visible', count > 0)
    btn.disabled = count === 0
  }

  // 生成按钮点击
  btn.addEventListener('click', async () => {
    const words = getSelectedWords()
    if (words.length === 0) return

    btn.style.display = 'none'
    loading.classList.add('visible')

    try {
      const idea = await fetchCreativeIdeas(words)
      modalTags.innerHTML = words.map(w => `<span>${w.zh}</span>`).join('')
      modalBody.textContent = idea
      modal.classList.add('open')
    } catch (err) {
      console.error('生成创意失败:', err)
      alert('创意生成失败，请重试')
    } finally {
      loading.classList.remove('visible')
      btn.style.display = ''
    }
  })

  return { updateSelection }
}
