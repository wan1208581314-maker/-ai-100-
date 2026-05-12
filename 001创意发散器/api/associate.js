import { callDeepSeek, extractJsonArray, publicErrorMessage, rejectNonPost } from './_deepseek.js'

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return

  try {
    const { word, existing = [], temperature = 0.7 } = req.body
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
    ], temperature)

    res.json({ words: extractJsonArray(content) })
  } catch (err) {
    console.error('联想接口错误:', err)
    res.status(500).json({ error: publicErrorMessage(err, '联想失败，请稍后重试') })
  }
}
