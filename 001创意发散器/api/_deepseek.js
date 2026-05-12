const BASE_URL = 'https://api.deepseek.com'

export function isPostRequest(req) {
  return req.method === 'POST'
}

export function extractJsonArray(content) {
  const start = content.indexOf('[')
  const end = content.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('未找到有效 JSON 数组')
  return JSON.parse(content.slice(start, end + 1))
}

export async function callDeepSeek(messages, temperature = 1.0) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('请配置 DEEPSEEK_API_KEY 环境变量')
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature,
    }),
  })

  const data = await res.json()
  if (!data.choices || !data.choices[0]) {
    throw new Error(data.error?.message || 'DeepSeek API 调用失败')
  }
  return data.choices[0].message.content
}

export function rejectNonPost(req, res) {
  if (isPostRequest(req)) return false
  res.setHeader('Allow', 'POST')
  res.status(405).json({ error: 'Method Not Allowed' })
  return true
}
