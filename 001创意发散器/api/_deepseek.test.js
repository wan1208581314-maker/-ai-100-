import assert from 'node:assert/strict'
import { test } from 'node:test'

import { extractJsonArray, isPostRequest } from './_deepseek.js'

test('extractJsonArray reads a JSON array from model text', () => {
  const result = extractJsonArray('```json\n[{"zh":"咖啡","en":"Coffee"}]\n```')

  assert.deepEqual(result, [{ zh: '咖啡', en: 'Coffee' }])
})

test('extractJsonArray rejects text without a JSON array', () => {
  assert.throws(() => extractJsonArray('没有结构化结果'), /未找到有效 JSON 数组/)
})

test('isPostRequest only accepts POST', () => {
  assert.equal(isPostRequest({ method: 'POST' }), true)
  assert.equal(isPostRequest({ method: 'GET' }), false)
})
