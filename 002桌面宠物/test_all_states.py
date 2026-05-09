"""
自动测试所有 11 种动作状态。
每种动作播放一轮（完整帧数），验证帧加载和状态切换。
"""
import tkinter as tk
from PIL import Image, ImageTk
import os
import sys

SPRITESHEET = os.path.join(os.path.dirname(__file__), "assets", "spritesheet-11.webp")
FRAME_W, FRAME_H = 192, 208

STATES = {
    "idle":                  {"row": 0,  "frames": 6, "loop": True},
    "running-right":         {"row": 1,  "frames": 8, "loop": True},
    "running-left":          {"row": 2,  "frames": 8, "loop": True},
    "waving":                {"row": 3,  "frames": 4, "loop": False, "next": "idle"},
    "jumping":               {"row": 4,  "frames": 5, "loop": False, "next": "idle"},
    "failed":                {"row": 5,  "frames": 8, "loop": True},
    "waiting":               {"row": 6,  "frames": 6, "loop": True},
    "running":               {"row": 7,  "frames": 6, "loop": True},
    "review":                {"row": 8,  "frames": 6, "loop": True},
    "long-idle-angry-stomp": {"row": 9,  "frames": 8, "loop": False, "next": "idle"},
    "pet-shy-heart":         {"row": 10, "frames": 8, "loop": False, "next": "idle"},
}

STATE_ORDER = [
    "idle", "running-right", "running-left", "waving", "jumping",
    "failed", "waiting", "running", "review", "long-idle-angry-stomp", "pet-shy-heart"
]


class StateTester:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("State Tester")
        self.root.geometry("400x300+100+100")
        self.root.attributes("-topmost", True)

        self.sheet = Image.open(SPRITESHEET).convert("RGBA")
        self.frames = {}
        self._load_frames()

        self.label = tk.Label(self.root, text="Testing...", font=("Consolas", 12), justify="left")
        self.label.pack(expand=True, fill="both", padx=10, pady=10)

        self.canvas = tk.Canvas(self.root, width=FRAME_W, height=FRAME_H, bg="white")
        self.canvas.pack(pady=5)
        self.sprite_id = self.canvas.create_image(0, 0, anchor="nw")

        self.results = []
        self.current_test = 0
        self.current_frame = 0
        self.anim_job = None

        self.root.after(500, self._run_next_state)

    def _load_frames(self):
        for name, info in STATES.items():
            for fi in range(info["frames"]):
                x = fi * FRAME_W
                y = info["row"] * FRAME_H
                crop = self.sheet.crop((x, y, x + FRAME_W, y + FRAME_H))
                self.frames[(name, fi)] = ImageTk.PhotoImage(crop)

    def _run_next_state(self):
        if self.current_test >= len(STATE_ORDER):
            self._show_results()
            return

        state_name = STATE_ORDER[self.current_test]
        self.current_frame = 0
        self._animate_state(state_name)

    def _animate_state(self, state_name):
        info = STATES[state_name]
        if self.current_frame >= info["frames"]:
            # Done with this state
            self.results.append((state_name, "OK", info["frames"]))
            self.label.config(
                text=self._format_results() + f"\n\n[{self.current_test+1}/11] {state_name}: OK ({info['frames']} frames)"
            )
            self.current_test += 1
            self.root.after(300, self._run_next_state)
            return

        key = (state_name, self.current_frame)
        img = self.frames.get(key)
        if img:
            self.canvas.itemconfig(self.sprite_id, image=img)
            self.current_frame += 1
            self.root.after(100, lambda: self._animate_state(state_name))
        else:
            self.results.append((state_name, "FAIL", f"frame {self.current_frame} missing"))
            self.current_test += 1
            self.root.after(300, self._run_next_state)

    def _format_results(self):
        lines = []
        for name, status, detail in self.results:
            mark = "[OK]" if status == "OK" else "[FAIL]"
            lines.append(f"  {mark} {name}: {status} ({detail})")
        return "\n".join(lines)

    def _show_results(self):
        ok_count = sum(1 for _, s, _ in self.results if s == "OK")
        total = len(self.results)
        text = f"=== Test Results: {ok_count}/{total} passed ===\n\n"
        text += self._format_results()

        if ok_count == total:
            text += "\n\nAll 11 states OK!"
        else:
            text += "\n\nSome states FAILED!"

        self.label.config(text=text)

        # Write results to file for reliable output
        result_path = os.path.join(os.path.dirname(__file__), "test_results.txt")
        with open(result_path, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Results written to {result_path}")

        self.root.after(5000, self.root.destroy)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    tester = StateTester()
    tester.run()
