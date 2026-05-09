import tkinter as tk
from PIL import Image, ImageTk
import pystray
import os
import json
import ctypes
import winreg
import sys
import threading

# ─── Config ──────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))
SPRITESHEET = os.path.join(BASE_DIR, "assets", "spritesheet-11.webp")
CONFIG_FILE = os.path.join(BASE_DIR, "pet-config.json")
ICO_FILE = os.path.join(BASE_DIR, "piko.ico")
TRAY_PNG = os.path.join(BASE_DIR, "piko-tray.png")

FRAME_W, FRAME_H = 192, 208
FRAME_INTERVAL = 120  # ms

DEFAULT_SCALE = 0.8
DEFAULT_ALPHA = 1.0

APP_NAME = "PikoDesktopPet"
REG_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"

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


def is_autostart_enabled():
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_KEY, 0, winreg.KEY_READ)
        winreg.QueryValueEx(key, APP_NAME)
        winreg.CloseKey(key)
        return True
    except FileNotFoundError:
        return False


def set_autostart(enable):
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_KEY, 0, winreg.KEY_SET_VALUE)
        if enable:
            exe_path = sys.executable.replace("python.exe", "pythonw.exe")
            script_path = os.path.abspath(sys.argv[0])
            winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, f'"{exe_path}" "{script_path}"')
        else:
            try:
                winreg.DeleteValue(key, APP_NAME)
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
    except Exception:
        pass


# ─── Main Pet Class ──────────────────────────────────────────────────
class DesktopPet:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Piko")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-transparentcolor", "#010101")
        self.root.config(bg="#010101")
        self.root.resizable(False, False)

        # Windows: skip taskbar
        try:
            hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id())
            style = ctypes.windll.user32.GetWindowLongW(hwnd, -20)
            style |= 0x00000080  # WS_EX_TOOLWINDOW
            ctypes.windll.user32.SetWindowLongW(hwnd, -20, style)
        except Exception:
            pass

        # Window icon
        if os.path.exists(ICO_FILE):
            try:
                self.root.iconbitmap(ICO_FILE)
            except Exception:
                pass

        # Load spritesheet
        self.sheet_full = Image.open(SPRITESHEET).convert("RGBA")
        self.frames_cache = {}

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

        # Angry state
        self._angry = False
        self._corner_x = 0
        self._corner_y = 0

        # Scale and alpha
        cfg = load_config()
        self._scale = cfg.get("scale", DEFAULT_SCALE)
        self._alpha = cfg.get("alpha", DEFAULT_ALPHA)
        self.root.attributes("-alpha", self._alpha)

        self._eff_w = int(FRAME_W * self._scale)
        self._eff_h = int(FRAME_H * self._scale)

        self._rebuild_frames()
        self.canvas.config(width=self._eff_w, height=self._eff_h)
        self.root.geometry(f"{self._eff_w}x{self._eff_h}")

        # Position
        if "x" in cfg and "y" in cfg:
            self.root.geometry(f"+{cfg['x']}+{cfg['y']}")
        else:
            self.root.update_idletasks()
            sw = self.root.winfo_screenwidth()
            sh = self.root.winfo_screenheight()
            self.root.geometry(f"+{sw - self._eff_w - 40}+{sh - self._eff_h - 40}")

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

        # Close → minimize to tray
        self.root.protocol("WM_DELETE_WINDOW", self._minimize_to_tray)

        # System tray
        self._tray_icon = None
        self._setup_tray()

    # ─── System Tray ─────────────────────────────────────────────────
    def _setup_tray(self):
        if os.path.exists(TRAY_PNG):
            tray_image = Image.open(TRAY_PNG)
        else:
            tray_image = self.sheet_full.crop((0, 0, 192, 208)).resize((64, 64))

        menu = pystray.Menu(
            pystray.MenuItem("显示 Piko", self._tray_show, default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("唤醒", lambda: self.root.after(0, lambda: self._set_state("waving"))),
            pystray.MenuItem("回到待机", lambda: self.root.after(0, lambda: self._set_state("idle"))),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "开机自启",
                self._tray_toggle_autostart,
                checked=lambda item: is_autostart_enabled()
            ),
            pystray.MenuItem("退出 Piko", self._tray_quit),
        )
        self._tray_icon = pystray.Icon("Piko", tray_image, "Piko 桌面宠物", menu)

    def _tray_show(self, icon=None, item=None):
        self.root.after(0, self._restore_from_tray)

    def _tray_toggle_autostart(self, icon=None, item=None):
        current = is_autostart_enabled()
        set_autostart(not current)

    def _tray_quit(self, icon=None, item=None):
        self.root.after(0, self._real_quit)

    def _minimize_to_tray(self):
        """Hide window and show tray icon."""
        self._save_position()
        self.root.withdraw()
        if self._tray_icon:
            threading.Thread(target=self._tray_icon.run, daemon=True).start()

    def _restore_from_tray(self):
        """Show window and stop tray icon."""
        if self._tray_icon:
            self._tray_icon.stop()
        self.root.deiconify()
        self.root.attributes("-topmost", True)
        self._set_state("waving")

    def _real_quit(self):
        """Actually quit the app."""
        self._save_position()
        if self._tray_icon:
            self._tray_icon.stop()
        self.root.destroy()

    # ─── Animation ───────────────────────────────────────────────────
    def _rebuild_frames(self):
        self.frames_cache.clear()
        for state_name, state_info in STATES.items():
            row = state_info["row"]
            for fi in range(state_info["frames"]):
                x = fi * FRAME_W
                y = row * FRAME_H
                crop = self.sheet_full.crop((x, y, x + FRAME_W, y + FRAME_H))
                if self._scale != 1.0:
                    crop = crop.resize(
                        (self._eff_w, self._eff_h), Image.Resampling.LANCZOS
                    )
                self.frames_cache[(state_name, fi)] = ImageTk.PhotoImage(crop)

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
        self._corner_x = self.root.winfo_x()
        self._corner_y = self.root.winfo_y()
        self._angry = True
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        cx = (sw - self._eff_w) // 2
        cy = (sh - self._eff_h) // 2
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
        menu.add_command(label="调整大小/透明度", command=self._open_settings)
        menu.add_command(label="回到右下角", command=self._go_to_corner)
        menu.add_command(label="暂停/继续", command=self._toggle_pause)
        menu.add_separator()
        # 开机自启
        self._autostart_var = tk.BooleanVar(value=is_autostart_enabled())
        menu.add_checkbutton(label="开机自启", variable=self._autostart_var,
                             command=self._toggle_autostart)
        menu.add_separator()
        menu.add_command(label="最小化到托盘", command=self._minimize_to_tray)
        menu.add_command(label="退出", command=self._real_quit)
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    def _toggle_autostart(self):
        set_autostart(self._autostart_var.get())

    def _open_settings(self):
        win = tk.Toplevel(self.root)
        win.title("Piko 设置")
        win.geometry("300x180")
        win.resizable(False, False)
        win.attributes("-topmost", True)

        tk.Label(win, text="宠物大小").pack(pady=(10, 0))
        scale_var = tk.DoubleVar(value=self._scale)
        scale_slider = tk.Scale(
            win, from_=0.3, to=2.0, resolution=0.1,
            orient=tk.HORIZONTAL, variable=scale_var, length=250
        )
        scale_slider.pack()

        tk.Label(win, text="透明度").pack(pady=(5, 0))
        alpha_var = tk.DoubleVar(value=self._alpha)
        alpha_slider = tk.Scale(
            win, from_=0.2, to=1.0, resolution=0.05,
            orient=tk.HORIZONTAL, variable=alpha_var, length=250
        )
        alpha_slider.pack()

        def apply_settings():
            new_scale = scale_var.get()
            new_alpha = alpha_var.get()
            changed = False

            if abs(new_scale - self._scale) > 0.01:
                self._scale = new_scale
                self._eff_w = int(FRAME_W * self._scale)
                self._eff_h = int(FRAME_H * self._scale)
                self._rebuild_frames()
                self.canvas.config(width=self._eff_w, height=self._eff_h)
                self.root.geometry(f"{self._eff_w}x{self._eff_h}")
                self._update_sprite()
                changed = True

            if abs(new_alpha - self._alpha) > 0.01:
                self._alpha = new_alpha
                self.root.attributes("-alpha", self._alpha)
                changed = True

            if changed:
                cfg = load_config()
                cfg["scale"] = self._scale
                cfg["alpha"] = self._alpha
                save_config(cfg)

            win.destroy()

        tk.Button(win, text="应用", command=apply_settings, width=10).pack(pady=10)

    def _go_to_corner(self):
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.root.geometry(f"+{sw - self._eff_w - 40}+{sh - self._eff_h - 40}")
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
        cfg = load_config()
        cfg["x"] = x
        cfg["y"] = y
        save_config(cfg)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    pet = DesktopPet()
    pet.run()
