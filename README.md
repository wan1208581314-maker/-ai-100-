# 用AI制作100个应用

一个用 AI（Claude Code）从零开始制作的 100 个 Web 应用合集。每个应用都是独立项目，记录完整的开发过程、踩坑反思和版本迭代。

---

## 项目列表

| 编号 | 名称 | 简介 | 技术栈 | 状态 |
|------|------|------|--------|------|
| 001 | 创意发散器 | AI 联想词图谱 + 创意方案生成 | Vite + 原生JS + Express + DeepSeek API | v2.2 |

---

## 001 创意发散器

一个基于 AI 联想的创意发散工具。输入一个词，AI 自动联想 8 个相关词，以可交互的节点图谱展示，用户可以选择多个词语让 AI 生成创意方案。

**核心功能：**
- 输入词语 → DeepSeek API 联想 8 个相关词
- 玻璃态节点图谱展示，支持拖拽、平移、缩放
- 点击节点展开联想词，支持折叠/展开
- 弹簧物理拖拽：拖拽父节点时子节点飘逸跟随
- 右键选择节点 → AI 生成创意方案
- 历史记录（localStorage）
- 暗色模式

**启动方式：**
```bash
cd 001创意发散器
npm install
# 创建 .env 文件，填入 DEEPSEEK_API_KEY=sk-xxx
npm run server   # 后端 localhost:3001
npm run dev      # 前端 localhost:5173
```

**项目结构：**
```
001创意发散器/
├── src/
│   ├── main.js        # 入口，初始化所有模块
│   ├── graph.js       # 节点图谱核心（平移缩放、拖拽、弹簧物理、折叠、连线）
│   ├── input.js       # 输入框组件
│   ├── history.js     # 历史记录（localStorage）
│   ├── generator.js   # 创意生成按钮 + 结果弹窗
│   ├── api.js         # fetch 请求封装
│   └── style.css      # 全部样式
├── server/
│   └── index.js       # Express 后端，DeepSeek API 调用
├── 项目日志.md         # 版本迭代记录（v1.0 ~ v2.2）
├── 自我反思与改进.md   # 开发过程中的问题分析与改进
├── 创意发散-项目指南.md # 复刻指南（两次对话即可复刻）
└── vite.config.js
```

**版本历史：** 详见 [001创意发散器/项目日志.md](001创意发散器/项目日志.md)

---

## 使用的 AI 工具

- **Claude Code** — 主要开发工具，负责代码编写、bug 修复、Prompt 优化
- **DeepSeek API** — 应用内调用的大模型，负责联想和创意方案生成

---

## 版本管理

每个应用独立版本号（v1.0、v2.0...），每次完成版本后 git commit + push。

如需回退：
```bash
git log --oneline          # 查看版本历史
git checkout <hash> -- 001创意发散器/  # 回退到指定版本
```
