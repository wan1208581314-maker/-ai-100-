export function initInput(onSubmit) {
  const app = document.getElementById('app')

  const area = document.createElement('div')
  area.className = 'input-area centered'
  area.innerHTML = `
    <div class="input-wrap">
      <input type="text" placeholder="输入一个词，开始你的创意旅程..." />
      <button class="submit-btn">&#8593;</button>
    </div>
  `
  app.appendChild(area)

  const input = area.querySelector('input')
  const btn = area.querySelector('.submit-btn')

  function submit() {
    const val = input.value.trim()
    if (!val) return
    input.value = ''
    onSubmit(val)

    // 第一次提交后移到底部
    if (area.classList.contains('centered')) {
      area.classList.remove('centered')
      area.classList.add('docked')
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit()
  })
  btn.addEventListener('click', submit)
}
