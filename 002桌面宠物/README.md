# 002 桌面宠物 — Piko Desktop Pet

一个可交互的 Windows 桌面宠物程序。角色 Piko 以透明悬浮窗的形式出现在桌面上，支持 11 种动作、鼠标交互、拖拽移动、长时间未互动生气等功能。

## 快速启动

```bash
pip install Pillow
python pet.py
```

## 交互方式

| 操作 | 效果 |
|------|------|
| 鼠标悬停 | jumping（跳跃） |
| 单击 | waving（挥手） |
| 双击 | pet-shy-heart（害羞） |
| 拖拽 | 跟随移动 + running-left/right |
| 右键 | 控制菜单 |
| 30 分钟无操作 | 跑到屏幕中央生气跺脚 |

## 文件说明

- `pet.py` — 主程序
- `assets/` — 角色素材（spritesheet + manifest）
- `桌面宠物制作文档.md` — 完整制作指南，可发给 AI 复现
- `test_all_states.py` — 动作测试
- `test_long_idle.py` — 生气流程测试
- `CHANGELOG.md` — 版本日志

## 当前版本

**v1.1** — 新增透明度和大小调整，11 种动作，完整交互
