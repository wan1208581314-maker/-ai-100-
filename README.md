# 用AI制作100个应用

一个用 AI（Claude Code）从零开始制作的 100 个 Web 应用合集。每个应用都是独立项目，记录完整的开发过程、踩坑反思和版本迭代。

---

## 项目列表

| 编号 | 名称 | 简介 | 技术栈 | 状态 |
|------|------|------|--------|------|
| 001 | 创意发散器 | AI 联想词图谱 + 创意方案生成 | Vite + 原生JS + Express + DeepSeek API | v2.2 |
| 002 | 桌面宠物 | 透明悬浮窗可交互桌面宠物，11种动作 | Python + tkinter + Pillow | v1.0 |

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

## 002 桌面宠物

一个可交互的 Windows 桌面宠物程序。角色 Piko 以透明悬浮窗的形式出现在桌面上，支持 11 种动作、鼠标交互、拖拽移动、长时间未互动生气等功能。

**核心功能：**
- 透明悬浮窗，始终置顶，不在任务栏显示
- 11 种动作状态（idle、running、waving、jumping、failed、waiting、review、long-idle-angry-stomp、pet-shy-heart 等）
- 鼠标悬停跳跃、单击挥手、双击害羞、拖拽移动
- 30 分钟无互动自动跑到屏幕中央生气跺脚
- 点击生气中的宠物 → 害羞 → 跑回原位
- 自动适配任意屏幕分辨率
- 窗口位置自动保存/恢复

**启动方式：**
```bash
cd 002桌面宠物
pip install Pillow
python pet.py
```

**项目结构：**
```
002桌面宠物/
├── pet.py                  # 主程序
├── assets/
│   ├── spritesheet-11.webp # 11动作序列帧素材
│   └── manifest.json       # 动作清单
├── 桌面宠物制作文档.md       # 完整制作指南（可发给AI复现）
├── test_all_states.py      # 动作测试
├── test_long_idle.py       # 生气流程测试
├── CHANGELOG.md            # 版本日志
└── README.md               # 项目说明
```

**版本历史：** 详见 [002桌面宠物/CHANGELOG.md](002桌面宠物/CHANGELOG.md)

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
