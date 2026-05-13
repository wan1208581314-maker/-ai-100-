import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildIdeaMessages, normalizeIdeaText } from './generate.js'

test('buildIdeaMessages asks for a short non-markdown idea', () => {
  const messages = buildIdeaMessages([{ zh: '设计思维', en: 'Design Thinking' }])
  const prompt = messages.map(message => message.content).join('\n')

  assert.match(prompt, /不要使用 Markdown/)
  assert.match(prompt, /80-120 个中文字/)
  assert.match(prompt, /只返回标题和正文/)
})

test('normalizeIdeaText removes markdown markers and blank lines', () => {
  const result = normalizeIdeaText('# 灵感标题\n\n## 正文\n这是一个想法。\n\n继续说明。')

  assert.equal(result, '灵感标题\n正文\n这是一个想法。\n继续说明。')
})
