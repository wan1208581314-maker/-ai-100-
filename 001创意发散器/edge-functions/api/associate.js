const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

export async function onRequestPost({ request, env }) {
  try {
    const { word, degree = 5, existing = [] } = await request.json()

    if (!word || typeof word !== 'string') {
      return json({ error: '缺少联想词' }, 400)
    }

    const apiKey = env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return json({ error: '未配置 DEEPSEEK_API_KEY' }, 500)
    }

    const avoidList = Array.isArray(existing) && existing.length > 0
      ? `\n6. 请务必避免返回以下已出现的词语：${existing.join('、')}`
      : ''

    const prompt = `用户输入了"${word}"，请围绕它联想8个词。

发散度参数为 ${degree}/10。数值越低越贴近原词，数值越高越跨界，但必须能说通。

要求：
1. 联想词要是具体的事物、场景、动作、品牌、人名、作品名等，不要抽象概念
2. 要有意外感，但不能牵强
3. 带点网感，可以是热梗、互联网黑话、流行文化、年轻人的生活方式
4. 覆盖不同方向：同品类、使用场景、相关人物、替代品、反面、周边、跨界混搭等
5. 每个词包含 zh 和 en，严格按JSON数组返回，不要其他文字${avoidList}

格式：[{"zh":"冰美式","en":"Iced Americano"},...]`

    const deepseekRes = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个潮流创意策划师，熟悉小红书、抖音、B站的热门内容风格。你的联想特点是：接地气、有画面感、带点网感和趣味性。你只返回JSON数组，不返回其他内容。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    })

    const data = await deepseekRes.json()
    const content = data.choices?.[0]?.message?.content

    if (!deepseekRes.ok || !content) {
      return json({ error: data.error?.message || 'DeepSeek API 调用失败' }, 500)
    }

    const start = content.indexOf('[')
    const end = content.lastIndexOf(']')
    if (start === -1 || end === -1) {
      return json({ error: '未找到有效 JSON 数组' }, 500)
    }

    return json({ words: JSON.parse(content.slice(start, end + 1)) })
  } catch (error) {
    return json({ error: '联想失败' }, 500)
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() })
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
