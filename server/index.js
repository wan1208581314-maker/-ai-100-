import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const app = express()
app.use(cors())
app.use(express.json())

const API_KEY = process.env.DEEPSEEK_API_KEY
const BASE_URL = 'https://api.deepseek.com'

async function callDeepSeek(messages, temperature = 1.0) {
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
      temperature,
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
    const avoidList = existing.length > 0 ? `\n5. 请务必避免返回以下已出现的词语：${existing.join('、')}` : ''
    const prompt = `用户输入了"${word}"，请围绕它联想8个词。

核心原则：每个词必须和"${word}"强相关。联想可以巧妙、有趣，但不能牵强——如果别人看到这个词，应该能立刻明白"为什么从${word}想到了它"。

联想方向建议（每个方向挑一两个即可，不用全部覆盖）：
- 工具/设备：${word}常用什么工具
- 场景/空间：${word}在什么环境下工作或出现
- 上下游：${word}的上游输入或下游产出是什么
- 风格/流派：${word}领域内有什么分支或风格
- 代表人物/品牌：行业内公认的名字
- 痛点/需求：${word}面临什么困扰或用户需要什么
- 搭配/组合：${word}常和什么一起出现
- 趋势/新事物：${word}领域最近有什么新变化

要求：
1. 每个联想词必须是和"${word}"直接相关的具体事物，不能是抽象概念
2. 优先选生动、有画面感的词，让人能"看到"它
3. 网感可以有，但不能为了网感牺牲相关性
4. 每个词包含 zh 和 en，严格按JSON数组返回，不要其他文字${avoidList}

格式：[{"zh":"冰美式","en":"Iced Americano"},...]`

    const content = await callDeepSeek([
      { role: 'system', content: '你是一个创意联想助手，擅长从一个词出发，沿着具体的方向（工具、场景、人物、风格、趋势等）找到生动且强相关的联想词。你的联想让人感觉"妙啊，确实是这样"，而不是"这有什么关系？"。你只返回JSON数组，不返回其他内容。' },
      { role: 'user', content: prompt },
    ], 0.7)

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
    const prompt = `用户在头脑风暴中选了这些词：${keywords}。

请生成一个创意方案，要求：
1. 给方案起一个有记忆点的标题（可以是slogan风格）
2. 一句话核心概念：用一句话说清楚这个创意"是什么"
3. 执行方案：给出3-5个具体可执行的步骤，每步要落地，不要空话
4. 适合什么平台/场景投放（小红书、抖音、线下活动、品牌联名等）
5. 目标人群是谁
6. 用中文，语气像一个资深创意总监在做提案，简洁有力，不要废话`

    const idea = await callDeepSeek([
      { role: 'system', content: '你是一个实战派创意策划师，产出的方案可以直接给客户提案。你擅长把天马行空的联想变成可落地的创意方案，风格受小红书爆款笔记和品牌联名案例启发。' },
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
