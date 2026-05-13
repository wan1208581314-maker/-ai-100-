# 今天吃什么 - 项目规则

## 项目信息
- **技术栈**: React 19 + Vite 8 + Tailwind CSS 4 + Framer Motion 12
- **包管理器**: npm
- **启动命令**: `npm run dev` (端口 5173)
- **构建命令**: `npm run build`
- **Lint 命令**: `npm run lint`
- **类型检查**: 无 TypeScript，跳过
- **E2E 测试**: Playwright MCP (真人验收)

## 完成规则

**每次完成应用或功能后，禁止直接说"完成"。必须执行以下流程：**

### 1. 代码审查
- Review `git diff` 确认变更范围
- 检查是否有未处理的 console.log、调试代码

### 2. 静态检查
- 运行 `npm run lint` 确保无 lint 错误
- 运行 `npm run build` 确保构建成功
- 运行 `npm run preview` 验证生产构建

### 3. 真人验收 (必须)
- 启动 `npm run dev`
- 使用 Playwright MCP 像真人一样操作浏览器
- 测试主要用户流程 (点击、输入、提交、刷新、返回)
- 测试无效输入和边界情况
- 检查视觉布局是否符合设计
- 截图保存关键页面

### 4. 控制台检查
- 检查浏览器 console errors
- 检查 failed network requests
- 检查 React error boundaries

### 5. Bug 管理
- 发现的 bug 记录到 `.claude/qa/bug-report.md`
- 自动修复 bug
- 修复后重新测试失败的流程
- 记录修复结果

### 6. 最终报告
- 生成 `.claude/qa/final-qa-report.md`
- 报告必须包含 `APPROVED: YES` 或 `APPROVED: NO`
- 生成 `.claude/qa/approval.hash` (当前 git diff 的 hash)

### 7. 完成条件
- 只有 `final-qa-report.md` 存在且包含 `APPROVED: YES`
- 只有 `approval.hash` 匹配当前 git diff
- 才允许说"完成"

## 文件结构
```
.claude/
├── agents/
│   ├── human-qa-tester.md    # QA 测试员 (只测试不改代码)
│   ├── bug-fixer.md           # Bug 修复员 (修复+复测)
│   └── code-reviewer.md       # 代码审查员 (审查不改代码)
├── hooks/
│   └── final-quality-gate.sh  # 停止前质量门禁
├── qa/
│   ├── bug-report.md          # Bug 报告
│   ├── final-qa-report.md     # 最终 QA 报告
│   └── approval.hash          # 审批 hash
├── skills/
│   └── human-qa/
│       └── SKILL.md           # 人验收 skill
└── settings.json              # Claude Code 设置
```

## 重要提示
- **不要只读代码就说通过** - 必须真的启动应用、打开浏览器、像真人一样使用
- **发现问题不要问用户** - 直接修复并复测
- **每次验收都要截图** - 保存到 `.claude/qa/screenshots/`
- **保持文档更新** - 根据项目演进更新验收标准
