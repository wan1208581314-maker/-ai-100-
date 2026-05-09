# [AI CONTEXT] 用AI制作100个应用

## 你是谁
你正在阅读一个由 Claude Code 开发的 Web 应用合集仓库。每个子文件夹是一个独立应用，包含完整的源码、开发日志和反思文档。

## 仓库结构
```
用ai制作100个应用/
├── README.md            # 人类阅读的说明文档
├── README.AI.md         # 你现在读的这个文件
├── 001创意发散器/        # 第1个应用
│   ├── src/             # 前端源码（Vite + 原生JS，无框架）
│   ├── server/          # 后端源码（Express + DeepSeek API）
│   ├── 项目日志.md       # 版本迭代记录（可用来回退版本）
│   ├── 自我反思与改进.md # 开发过程中的错误分析
│   └── 创意发散-项目指南.md # 用两次对话复刻本项目的指南
├── 002xxx/              # 第2个应用（待创建）
└── ...
```

## 001 创意发散器 — 技术细节

### 技术栈
- 前端：Vite 5 + 原生 JavaScript（无 React/Vue）
- 后端：Node.js + Express
- AI：DeepSeek API（deepseek-chat 模型）
- 样式：单文件 CSS，毛玻璃设计风格
- 状态：localStorage（历史记录）

### 核心架构
- `src/main.js` — 入口，初始化所有模块，创建 DOM 结构
- `src/graph.js` — 节点图谱核心，包含：
  - 画布平移缩放（CSS transform + screenToWorld 坐标转换）
  - 节点拖拽 + 弹簧物理跟随（lerp + 多频 sin/cos 飘动）
  - SVG 贝塞尔曲线连线
  - 折叠/展开（递归隐藏后代 + 数量徽章）
  - 右键多选 + Ctrl+Z 撤销
- `src/input.js` — 输入框组件，提交后 dock 到底部
- `src/history.js` — localStorage 历史记录，侧边抽屉
- `src/generator.js` — 创意方案生成按钮 + 结果弹窗
- `src/api.js` — fetch 封装（/api/associate、/api/generate）
- `server/index.js` — Express 后端，两处 DeepSeek API 调用

### API 接口
```
POST /api/associate  { word, existing[] } → { words: [{zh, en}] }
POST /api/generate   { words: [{zh, en}] } → { idea: string }
```

### 启动命令
```bash
cd 001创意发散器
npm install
echo DEEPSEEK_API_KEY=sk-xxx > .env
npm run server   # 后端 :3001
npm run dev      # 前端 :5173（自动代理 /api → :3001）
```

### 已知问题与待优化
- 弹簧物理的飘逸感仍在调优中（v2.2 的 lerp + drift 方案基本可用）
- Prompt 优化有三版记录，当前版本强调强相关性 + 网感

### 版本管理
- 版本号格式：v主版本.次版本（v2.2）
- 每次版本完成 git commit，可用来回退
- 项目日志.md 记录每次改动的文件和内容

### 给其他 AI 的提示
1. 修改代码前先读 style.css，理解 CSS 动画系统（float1/float2/float3 使用 transform: translate）
2. graph.js 中的弹簧物理使用 transform 而非 left/top 移动节点，避免与 CSS 动画冲突
3. DeepSeek 返回的 JSON 可能被 markdown 包裹，需提取 [...] 子串再解析
4. 节点拖拽事件绑定在 document 上，通过 e.target.closest() 排除 UI 元素
5. 历史记录存储在 localStorage，key 为 'creative-muse-history'

## 如何添加新应用
1. 在仓库根目录创建新文件夹（如 `002待办清单/`）
2. 初始化项目（Vite、React、Vue 均可，不限技术栈）
3. 写好代码后在本文件和 README.md 中添加项目条目
4. git commit + push
