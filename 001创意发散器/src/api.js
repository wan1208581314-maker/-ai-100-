export async function fetchAssociations(word, existing = [], temperature = 0.7) {
  const res = await fetch('/api/associate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, existing, temperature }),
  })
  if (!res.ok) throw new Error('联想请求失败')
  const data = await res.json()
  return data.words
}

export async function fetchCreativeIdeas(words) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words }),
  })
  if (!res.ok) throw new Error('创意生成失败')
  const data = await res.json()
  return data.idea
}
