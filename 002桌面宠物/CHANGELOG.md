# 版本日志

## v1.0 — 2026-05-09

### 初始版本

**功能：**
- 透明悬浮窗桌面宠物，始终置顶，不在任务栏显示
- 读取 spritesheet 序列帧图集播放动画
- 11 种动作状态：idle、running-right、running-left、waving、jumping、failed、waiting、running、review、long-idle-angry-stomp、pet-shy-heart
- 状态机：支持循环/非循环动作，非循环动作播完自动跳转
- 每个动作可设置独立帧间隔

**交互：**
- 鼠标悬停 → jumping（跳跃）
- 单击 → waving（挥手）
- 双击 → pet-shy-heart（害羞爱心眼）
- 拖拽 → 跟随移动，方向播放 running-left / running-right
- 右键菜单 → 唤醒、回到待机、回到右下角、暂停/继续、退出

**高级功能：**
- 30 分钟无互动 → 自动跑到屏幕正中央，循环播放 long-idle-angry-stomp 生气跺脚
- 生气时点击 → pet-shy-heart 害羞 → 跑回原位 → idle
- 窗口位置自动保存/恢复
- 自动适配任意屏幕分辨率居中

**技术栈：**
- Python 3.12 + tkinter + Pillow
- 单文件 pet.py，约 350 行

**文件：**
- pet.py — 主程序
- assets/spritesheet-11.webp — 11 动作素材
- assets/manifest.json — 动作清单
- 桌面宠物制作文档.md — 完整制作指南（可发给 AI 复现）
- test_all_states.py — 11 种动作测试脚本
- test_long_idle.py — 生气跺脚流程测试脚本
