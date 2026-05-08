import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const app = express()
app.use(cors())
app.use(express.json())

const API_KEY = process.env.DEEPSEEK_API_KEY
const BASE_URL = 'https://api.deepseek.com'

async function callDeepSeek(messages) {
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    throw new Error('请在 .env 文件中配置 DEEPSEEK_API_KEY')
  }
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.9,
    }),
  })
  const data = await res.json()
  if (!data.choices || !data.choices[0]) {
    throw new Error(data.error?.message || 'DeepSeek API 调用失败')
  }
  return data.choices[0].message.content
}

// 词语联想接口
app.post('/api/associate', async (req, res) => {
  try {
    const { word, existing = [] } = req.body
    const avoidList = existing.length > 0 ? `\n4. 请务必避免返回以下已出现的词语：${existing.join('、')}` : ''
    const prompt = `你是一个创意联想助手。用户输入了一个词"${word}"，请你围绕这个词进行发散联想，给出8个相关的联想词。

要求：
1. 每个联想词都要包含中文和对应的英文翻译
2. 联想要有创意和发散性，不要只是近义词，要从不同角度联想
3. 严格按照JSON数组格式返回，不要包含任何其他文字${avoidList}

返回格式示例：
[{"zh":"创意","en":"Creativity"},{"zh":"灵感","en":"Inspiration"}]`

    const content = await callDeepSeek([
      { role: 'system', content: '你只返回JSON数组，不要返回其他任何内容。' },
      { role: 'user', content: prompt },
    ])

    // 提取 JSON 数组（兼容 DeepSeek 可能返回的 markdown 包裹或额外文字）
    const start = content.indexOf('[')
    const end = content.lastIndexOf(']')
    if (start === -1 || end === -1) throw new Error('未找到有效 JSON 数组')
    const words = JSON.parse(content.slice(start, end + 1))
    res.json({ words })
  } catch (err) {
    console.error('联想接口错误:', err)
    res.status(500).json({ error: '联想失败' })
  }
})

// 创意生成接口
app.post('/api/generate', async (req, res) => {
  try {
    const { words } = req.body
    const keywords = words.map(w => `${w.zh}(${w.en})`).join('、')
    const prompt = `你是一个创意策划专家。用户在头脑风暴中选择了以下关键词：${keywords}。

请根据这些关键词，生成一个创意方案。要求：
1. 方案要有标题
2. 包含核心创意概念（2-3句话）
3. 列出3-5个具体的执行步骤
4. 说明预期效果
5. 用中文回答，语言简洁有力`

    const idea = await callDeepSeek([
      { role: 'system', content: '你是一个专业的创意策划师，擅长将不同领域的概念融合产生创新方案。' },
      { role: 'user', content: prompt },
    ])

    res.json({ idea })
  } catch (err) {
    console.error('创意生成错误:', err)
    res.status(500).json({ error: '创意生成失败' })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`后端代理已启动: http://localhost:${PORT}`)
})
