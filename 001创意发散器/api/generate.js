import { callDeepSeek, publicErrorMessage, rejectNonPost } from './_deepseek.js'

export function buildIdeaMessages(words) {
  const keywords = words.map(w => `${w.zh}(${w.en})`).join('、')
  const prompt = `用户选中了这些灵感词：${keywords}。

请基于这些词生成一个简单、清楚、能看懂的小想法。

要求：
1. 只生成一个想法，不要生成多个方向
2. 不要使用 Markdown，不要使用 #、##、**、列表符号
3. 只返回标题和正文，两行即可：第一行是标题，第二行是正文
4. 标题不要超过 14 个中文字，必须具体、正常、好懂
5. 正文控制在 80-120 个中文字，写成一段话，不要空行
6. 不要写宏大的营销提案，不要写标题党，不要写看不懂的比喻
7. 语气像人在灵感本里记下一个可执行的小想法`

  return [
    { role: 'system', content: '你是一个清醒、克制的创意助手。你的任务不是炫技，而是把用户选中的词收束成一个正常人能看懂、能判断、能稍微行动的小想法。' },
    { role: 'user', content: prompt },
  ]
}

export function normalizeIdeaText(text) {
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
}

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) return

  try {
    const { words } = req.body
    const idea = await callDeepSeek(buildIdeaMessages(words), 0.7)

    res.json({ idea: normalizeIdeaText(idea) })
  } catch (err) {
    console.error('创意生成错误:', err)
    res.status(500).json({ error: publicErrorMessage(err, '创意生成失败，请稍后重试') })
  }
}
