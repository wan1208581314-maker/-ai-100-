import { callDeepSeek, publicErrorMessage, rejectNonPost } from './_deepseek.js'

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return

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
    res.status(500).json({ error: publicErrorMessage(err, '创意生成失败，请稍后重试') })
  }
}
