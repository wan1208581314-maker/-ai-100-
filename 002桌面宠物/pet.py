import tkinter as tk
from PIL import Image, ImageTk
import os
import json
import ctypes

# ─── Config ──────────────────────────────────────────────────────────
SPRITESHEET = os.path.join(os.path.dirname(__file__), "assets", "spritesheet-11.webp")
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "pet-config.json")

FRAME_W, FRAME_H = 192, 208
FRAME_INTERVAL = 120  # ms

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
    "long-idle-angry-stomp": {"row": 9,  "frames": 8, "loop": True},
    "pet-shy-heart":         {"row": 10, "frames": 8, "loop": False, "next": "idle", "interval": 200},
}

IDLE_TIMEOUT_MS = 30 * 60 * 1000  # 30 minutes


# ─── Helpers ─────────────────────────────────────────────────────────
def load_config():
    try:
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(cfg):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(cfg, f)
    except Exception:
        pass


# ─── Main Pet Class ──────────────────────────────────────────────────
class DesktopPet:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Piko")
        self.root.overrideredirect(True)          # no title bar
        self.root.attributes("-topmost", True)    # always on top
        self.root.attributes("-transparentcolor", "#010101")  # transparent bg
        self.root.config(bg="#010101")
        self.root.resizable(False, False)

        # Windows-specific: skip taskbar
        try:
            hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id())
            style = ctypes.windll.user32.GetWindowLongW(hwnd, -20)  # GWL_EXSTYLE
            style |= 0x00000080  # WS_EX_TOOLWINDOW (hide from taskbar)
            ctypes.windll.user32.SetWindowLongW(hwnd, -20, style)
        except Exception:
            pass

        # Load spritesheet
        self.sheet_full = Image.open(SPRITESHEET).convert("RGBA")
        self.frames_cache = {}  # (state, frame_idx) -> PhotoImage

        # Pre-cache all frames
        for state_name, state_info in STATES.items():
            row = state_info["row"]
            for fi in range(state_info["frames"]):
                x = fi * FRAME_W
                y = row * FRAME_H
                crop = self.sheet_full.crop((x, y, x + FRAME_W, y + FRAME_H))
                self.frames_cache[(state_name, fi)] = ImageTk.PhotoImage(crop)

        # Canvas
        self.canvas = tk.Canvas(
            self.root, width=FRAME_W, height=FRAME_H,
            bg="#010101", highlightthickness=0
        )
        self.canvas.pack()
        self.sprite_id = self.canvas.create_image(0, 0, anchor="nw")

        # State
        self.current_state = "idle"
        self.current_frame = 0
        self.paused = False
        self.anim_job = None
        self.idle_job = None

        # Drag state
        self._drag_data = {"x": 0, "y": 0, "dragging": False}
        self._double_clicked = False

        # Angry state tracking
        self._angry = False
        self._corner_x = 0
        self._corner_y = 0

        # Position window
        cfg = load_config()
        if "x" in cfg and "y" in cfg:
            self.root.geometry(f"+{cfg['x']}+{cfg['y']}")
        else:
            self.root.update_idletasks()
            sw = self.root.winfo_screenwidth()
            sh = self.root.winfo_screenheight()
            self.root.geometry(f"+{sw - FRAME_W - 40}+{sh - FRAME_H - 40}")

        # Bindings
        self.canvas.bind("<Button-1>", self._on_click)
        self.canvas.bind("<B1-Motion>", self._on_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_release)
        self.canvas.bind("<Double-Button-1>", self._on_double_click)
        self.canvas.bind("<Enter>", self._on_enter)
        self.canvas.bind("<Button-3>", self._on_right_click)

        # Start
        self._update_sprite()
        self._start_anim()
        self._reset_idle_timer()

        # Save position on close
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    # ─── Animation ───────────────────────────────────────────────────
    def _update_sprite(self):
        key = (self.current_state, self.current_frame)
        img = self.frames_cache.get(key)
        if img:
            self.canvas.itemconfig(self.sprite_id, image=img)

    def _tick(self):
        if self.paused:
            return
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
        interval = STATES[self.current_state].get("interval", FRAME_INTERVAL)
        self.anim_job = self.root.after(interval, self._tick)

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
        # Allow re-entering non-loop states (so clicking works repeatedly)
        if new_state == self.current_state and STATES[new_state]["loop"]:
            return
        self.current_state = new_state
        self.current_frame = 0
        self._update_sprite()
        self._start_anim()
        self._reset_idle_timer()

    # ─── Idle timeout ────────────────────────────────────────────────
    def _reset_idle_timer(self):
        if self.idle_job:
            self.root.after_cancel(self.idle_job)
        self.idle_job = self.root.after(IDLE_TIMEOUT_MS, self._trigger_long_idle)

    def _trigger_long_idle(self):
        if self.current_state != "idle":
            return
        # Save current position as corner to return to later
        self._corner_x = self.root.winfo_x()
        self._corner_y = self.root.winfo_y()
        self._angry = True
        # Run to screen center
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        cx = (sw - FRAME_W) // 2
        cy = (sh - FRAME_H) // 2
        self._run_to(cx, cy, "long-idle-angry-stomp")

    def _run_to(self, target_x, target_y, after_state):
        cur_x = self.root.winfo_x()
        cur_y = self.root.winfo_y()
        dx = target_x - cur_x
        dy = target_y - cur_y
        direction = "running-right" if dx > 0 else "running-left"
        self._set_state(direction)

        dist = max(abs(dx), abs(dy))
        steps = max(1, dist // 8)
        step_x = dx / steps
        step_y = dy / steps

        def move_step(step=0):
            if step >= steps:
                self.root.geometry(f"+{target_x}+{target_y}")
                self._set_state(after_state)
                return
            new_x = int(cur_x + step_x * (step + 1))
            new_y = int(cur_y + step_y * (step + 1))
            self.root.geometry(f"+{new_x}+{new_y}")
            self.root.after(30, move_step, step + 1)

        move_step()

    def _return_to_corner(self):
        """Run back to the saved corner position, then go idle."""
        cur_x = self.root.winfo_x()
        cur_y = self.root.winfo_y()
        dx = self._corner_x - cur_x
        dy = self._corner_y - cur_y
        direction = "running-left" if dx < 0 else "running-right"
        self._set_state(direction)

        dist = max(abs(dx), abs(dy))
        steps = max(1, dist // 8)
        step_x = dx / steps
        step_y = dy / steps

        def move_step(step=0):
            if step >= steps:
                self.root.geometry(f"+{self._corner_x}+{self._corner_y}")
                self._set_state("idle")
                self._save_position()
                return
            new_x = int(cur_x + step_x * (step + 1))
            new_y = int(cur_y + step_y * (step + 1))
            self.root.geometry(f"+{new_x}+{new_y}")
            self.root.after(30, move_step, step + 1)

        move_step()

    # ─── Mouse interactions ──────────────────────────────────────────
    def _on_click(self, event):
        self._drag_data["x"] = event.x_root
        self._drag_data["y"] = event.y_root
        self._drag_data["dragging"] = False

    def _on_drag(self, event):
        dx = event.x_root - self._drag_data["x"]
        dy = event.y_root - self._drag_data["y"]
        if abs(dx) > 3 or abs(dy) > 3:
            self._drag_data["dragging"] = True

        if self._drag_data["dragging"]:
            new_x = self.root.winfo_x() + (event.x_root - self._drag_data["x"])
            new_y = self.root.winfo_y() + (event.y_root - self._drag_data["y"])
            self.root.geometry(f"+{new_x}+{new_y}")
            self._drag_data["x"] = event.x_root
            self._drag_data["y"] = event.y_root

            if dx > 2 and self.current_state != "running-right":
                self._set_state("running-right")
            elif dx < -2 and self.current_state != "running-left":
                self._set_state("running-left")

    def _on_release(self, event):
        if self._drag_data["dragging"]:
            self._set_state("idle")
            self._save_position()
        elif self._angry:
            # Clicked while angry → shy heart, then return to corner
            self._set_state("pet-shy-heart")
        elif not self._double_clicked:
            self._set_state("waving")
        self._drag_data["dragging"] = False
        self._double_clicked = False

    def _on_double_click(self, event):
        self._double_clicked = True
        if self._angry:
            self._set_state("pet-shy-heart")
        else:
            self._set_state("pet-shy-heart")

    def _on_enter(self, event):
        if not self._drag_data["dragging"] and self.current_state == "idle":
            self._set_state("jumping")

    def _on_right_click(self, event):
        menu = tk.Menu(self.root, tearoff=0)
        menu.add_command(label="唤醒 Piko", command=lambda: self._set_state("waving"))
        menu.add_command(label="回到待机", command=lambda: self._set_state("idle"))
        menu.add_separator()
        menu.add_command(label="回到右下角", command=self._go_to_corner)
        menu.add_command(label="暂停/继续", command=self._toggle_pause)
        menu.add_separator()
        menu.add_command(label="退出", command=self._on_close)
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    def _go_to_corner(self):
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.root.geometry(f"+{sw - FRAME_W - 40}+{sh - FRAME_H - 40}")
        self._save_position()

    def _toggle_pause(self):
        self.paused = not self.paused
        if self.paused:
            self._stop_anim()
        else:
            self._start_anim()

    def _save_position(self):
        x = self.root.winfo_x()
        y = self.root.winfo_y()
        save_config({"x": x, "y": y})

    def _on_close(self):
        self._save_position()
        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    pet = DesktopPet()
    pet.run()
