# 版本日志

## v1.2 — 2026-05-09

### 新增：系统托盘、开机自启、窗口图标

**新功能：**
- 关闭窗口不再退出，而是最小化到系统托盘（任务栏右下角显示 Piko 头像图标）
- 单击托盘图标 → 恢复显示 Piko
- 右键托盘菜单 → 显示 Piko、唤醒、开机自启、退出
- 右键菜单新增「开机自启」选项，勾选后写入 Windows 注册表
- 右键菜单新增「最小化到托盘」选项
- 窗口标题栏和托盘显示 Piko 角色图标（piko.ico）

**依赖：**
- 新增 pystray（系统托盘支持）

---

## v1.1 — 2026-05-09

### 新增：透明度和大小调整

**新功能：**
- 右键菜单新增「调整大小/透明度」选项
- 弹出设置窗口，可拖动滑块调整宠物大小（0.3x ~ 2.0x）
- 弹出设置窗口，可拖动滑块调整透明度（20% ~ 100%）
- 设置自动保存到 pet-config.json，下次启动恢复

**优化：**
- 默认大小调整为 0.8x（原版偏大）
- 窗口大小、居中位置、角落位置均适配缩放比例

---

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
