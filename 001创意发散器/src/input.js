export function initInput(onSubmit) {
  const app = document.getElementById('app')

  const area = document.createElement('div')
  area.className = 'input-area centered'
  area.innerHTML = `
    <div class="input-wrap">
      <input type="text" placeholder="输入一个词，开始你的创意旅程..." />
      <button class="submit-btn">&#8593;</button>
    </div>
    <div class="temp-control">
      <span class="temp-label">集中</span>
      <input type="range" class="temp-slider" min="0" max="1" step="0.1" value="0.7" />
      <span class="temp-label">发散</span>
      <span class="temp-value">0.7</span>
    </div>
  `
  app.appendChild(area)

  const input = area.querySelector('input[type="text"]')
  const btn = area.querySelector('.submit-btn')
  const slider = area.querySelector('.temp-slider')
  const tempValue = area.querySelector('.temp-value')
  let isSubmitting = false

  slider.addEventListener('input', () => {
    tempValue.textContent = slider.value
  })

  async function submit() {
    if (isSubmitting) return
    const val = input.value.trim()
    if (!val) return
    isSubmitting = true
    input.disabled = true
    btn.disabled = true
    input.value = ''
    try {
      await onSubmit(val)
      dock()
    } finally {
      isSubmitting = false
      input.disabled = false
      btn.disabled = false
      input.focus()
    }
  }

  function dock() {
    if (area.classList.contains('centered')) {
      area.classList.remove('centered')
      area.classList.add('docked')
    }
  }

  function getTemperature() {
    return parseFloat(slider.value)
  }

  function undock() {
    if (area.classList.contains('docked')) {
      area.classList.remove('docked')
      area.classList.add('centered')
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit()
  })
  btn.addEventListener('click', submit)

  return { dock, undock, getTemperature }
}
