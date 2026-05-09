"""
测试完整 long-idle 流程：
1. Piko 出现在屏幕左下角
2. 跑到屏幕中间（播放 running-right）
3. 到达中间后循环播放 long-idle-angry-stomp 生气跺脚
4. 点击她 → pet-shy-heart 害羞
5. 害羞完 → 跑回角落 → idle
"""
import tkinter as tk
from PIL import Image, ImageTk
import os
import ctypes

SPRITESHEET = os.path.join(os.path.dirname(__file__), "assets", "spritesheet-11.webp")
FRAME_W, FRAME_H = 192, 208
FRAME_INTERVAL = 120

STATES = {
    "idle":                  {"row": 0,  "frames": 6, "loop": True},
    "running-right":         {"row": 1,  "frames": 8, "loop": True},
    "running-left":          {"row": 2,  "frames": 8, "loop": True},
    "long-idle-angry-stomp": {"row": 9,  "frames": 8, "loop": True},
    "pet-shy-heart":         {"row": 10, "frames": 8, "loop": False, "next": "idle"},
}


class LongIdleTest:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Piko")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-transparentcolor", "#010101")
        self.root.config(bg="#010101")
        self.root.resizable(False, False)

        try:
            hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id())
            style = ctypes.windll.user32.GetWindowLongW(hwnd, -20)
            style |= 0x00000080
            ctypes.windll.user32.SetWindowLongW(hwnd, -20, style)
        except Exception:
            pass

        self.sheet = Image.open(SPRITESHEET).convert("RGBA")
        self.frames = {}
        for name, info in STATES.items():
            for fi in range(info["frames"]):
                x = fi * FRAME_W
                y = info["row"] * FRAME_H
                crop = self.sheet.crop((x, y, x + FRAME_W, y + FRAME_H))
                self.frames[(name, fi)] = ImageTk.PhotoImage(crop)

        self.canvas = tk.Canvas(
            self.root, width=FRAME_W, height=FRAME_H,
            bg="#010101", highlightthickness=0
        )
        self.canvas.pack()
        self.sprite_id = self.canvas.create_image(0, 0, anchor="nw")

        self.current_state = "idle"
        self.current_frame = 0
        self.anim_job = None
        self._angry = False
        self._corner_x = 0
        self._corner_y = 0

        # Start at bottom-left
        sh = self.root.winfo_screenheight()
        self.root.geometry(f"+40+{sh - FRAME_H - 40}")

        self._update_sprite()
        self._start_anim()

        # Click handler
        self.canvas.bind("<Button-1>", self._on_click)

        # After 1 second, start running to center
        self.root.after(1000, self._start_run_to_center)

    def _update_sprite(self):
        key = (self.current_state, self.current_frame)
        img = self.frames.get(key)
        if img:
            self.canvas.itemconfig(self.sprite_id, image=img)

    def _tick(self):
        state_info = STATES[self.current_state]
        self.current_frame += 1
        if self.current_frame >= state_info["frames"]:
            if state_info["loop"]:
                self.current_frame = 0
            else:
                # shy-heart finished → run back to corner
                if self.current_state == "pet-shy-heart" and self._angry:
                    self._angry = False
                    self._return_to_corner()
                    return
                nxt = state_info.get("next")
                if nxt:
                    self._set_state(nxt)
                return
        self._update_sprite()
        self._schedule_next_frame()

    def _schedule_next_frame(self):
        self.anim_job = self.root.after(FRAME_INTERVAL, self._tick)

    def _start_anim(self):
        self._stop_anim()
        self._schedule_next_frame()

    def _stop_anim(self):
        if self.anim_job:
            self.root.after_cancel(self.anim_job)
            self.anim_job = None

    def _set_state(self, new_state):
        if new_state not in STATES:
            return
        self.current_state = new_state
        self.current_frame = 0
        self._update_sprite()
        self._start_anim()

    def _on_click(self, event):
        if self._angry:
            self._set_state("pet-shy-heart")

    def _start_run_to_center(self):
        self._corner_x = self.root.winfo_x()
        self._corner_y = self.root.winfo_y()
        self._angry = True

        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        target_x = (sw - FRAME_W) // 2
        target_y = (sh - FRAME_H) // 2
        cur_x = self.root.winfo_x()
        cur_y = self.root.winfo_y()

        self._set_state("running-right" if target_x > cur_x else "running-left")

        dx = target_x - cur_x
        dy = target_y - cur_y
        dist = max(abs(dx), abs(dy))
        steps = max(1, dist // 6)
        step_x = dx / steps
        step_y = dy / steps

        def move_step(step=0):
            if step >= steps:
                self.root.geometry(f"+{target_x}+{target_y}")
                self._set_state("long-idle-angry-stomp")
                return
            new_x = int(cur_x + step_x * (step + 1))
            new_y = int(cur_y + step_y * (step + 1))
            self.root.geometry(f"+{new_x}+{new_y}")
            self.root.after(25, lambda: move_step(step + 1))

        move_step()

    def _return_to_corner(self):
        cur_x = self.root.winfo_x()
        cur_y = self.root.winfo_y()
        dx = self._corner_x - cur_x
        dy = self._corner_y - cur_y
        self._set_state("running-left" if dx < 0 else "running-right")

        dist = max(abs(dx), abs(dy))
        steps = max(1, dist // 6)
        step_x = dx / steps
        step_y = dy / steps

        def move_step(step=0):
            if step >= steps:
                self.root.geometry(f"+{self._corner_x}+{self._corner_y}")
                self._set_state("idle")
                return
            new_x = int(cur_x + step_x * (step + 1))
            new_y = int(cur_y + step_y * (step + 1))
            self.root.geometry(f"+{new_x}+{new_y}")
            self.root.after(25, lambda: move_step(step + 1))

        move_step()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    test = LongIdleTest()
    test.run()
