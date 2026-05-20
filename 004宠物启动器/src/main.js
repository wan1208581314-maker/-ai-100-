const { app, BrowserWindow, Menu, ipcMain, shell, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');

const PET_LIBRARY_ROOT = 'D:\\自媒体\\claude\\第四期';
const DEFAULT_CODEX_PET_ROOTS = [
  path.join(__dirname, '..', '..', '宠物包'),
  path.join(app.getPath('pictures'), '宠物包'),
  'C:\\Users\\DCKJ\\Pictures\\宠物包'
];
const CODEX_ACTION_MAP = {
  idle: { row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320], trigger: '默认待机' },
  'running-right': { row: 1, frames: 8, durations: [105, 105, 105, 105, 105, 105, 105, 105], trigger: '向右移动' },
  'running-left': { row: 2, frames: 8, durations: [105, 105, 105, 105, 105, 105, 105, 105], trigger: '向左移动' },
  waving: { row: 3, frames: 4, durations: [140, 140, 140, 280], trigger: '打招呼 / 收到提醒' },
  jumping: { row: 4, frames: 5, durations: [140, 140, 140, 140, 280], trigger: '双击 / 开心跳跃' },
  failed: { row: 5, frames: 8, durations: [140, 140, 140, 140, 140, 140, 140, 240], trigger: '很久没理，走到屏幕中间循环' },
  waiting: { row: 6, frames: 6, durations: [150, 150, 150, 150, 150, 260], trigger: '点击互动后等待' },
  running: { row: 7, frames: 6, durations: [120, 120, 120, 120, 120, 220], trigger: '自动游玩 / 正在陪伴' },
  review: { row: 8, frames: 8, durations: [130, 130, 130, 130, 130, 130, 130, 180], trigger: '电脑通知 / 观察状态' }
};
const CODEX_ACTION_DURATIONS = Object.fromEntries(
  Object.entries(CODEX_ACTION_MAP).map(([key, value]) => [key, value.durations])
);
const FALLBACK_ROW_DURATIONS = {
  4: [140, 140, 140, 280],
  5: [140, 140, 140, 140, 280],
  6: [150, 150, 150, 150, 150, 260],
  8: [140, 140, 140, 140, 140, 140, 140, 240]
};
const DEFAULT_BEHAVIOR_SETTINGS = {
  startup: true,
  hide: false,
  auto: false
};

let mainWindow = null;
const runningPets = new Map();
const desktopPetWindows = new Map();
const suppressedClosedPetIds = new Set();

function getUserConfigPath() {
  return path.join(app.getPath('userData'), 'launcher-config.json');
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadLauncherConfig() {
  const config = readJson(getUserConfigPath(), {
    selectedPetId: 'luya',
    lastLaunchTimes: {},
    knownPets: [],
    codexPetRoots: DEFAULT_CODEX_PET_ROOTS,
    hiddenPetIds: [],
    petNames: {},
    behaviorSettings: DEFAULT_BEHAVIOR_SETTINGS
  });
  return {
    ...config,
    behaviorSettings: {
      ...DEFAULT_BEHAVIOR_SETTINGS,
      ...(config.behaviorSettings ?? {})
    }
  };
}

function saveLauncherConfig(nextConfig) {
  fs.mkdirSync(path.dirname(getUserConfigPath()), { recursive: true });
  fs.writeFileSync(getUserConfigPath(), JSON.stringify({
    ...nextConfig,
    behaviorSettings: {
      ...DEFAULT_BEHAVIOR_SETTINGS,
      ...(nextConfig.behaviorSettings ?? {})
    }
  }, null, 2), 'utf8');
}

function applyStartupSetting(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: app.isPackaged ? [] : [path.join(__dirname, '..')]
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function broadcastBehaviorSettings(settings) {
  mainWindow?.webContents.send('behavior-settings:changed', settings);
  desktopPetWindows.forEach((petWindow) => {
    if (!petWindow.isDestroyed()) petWindow.webContents.send('behavior-settings:changed', settings);
  });
}

function updateBehaviorSetting(key, enabled) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_BEHAVIOR_SETTINGS, key)) {
    return { ok: false, message: '未知的行为设置。', config: loadLauncherConfig() };
  }

  const config = loadLauncherConfig();
  config.behaviorSettings = {
    ...DEFAULT_BEHAVIOR_SETTINGS,
    ...(config.behaviorSettings ?? {}),
    [key]: key === 'hide' ? false : Boolean(enabled)
  };
  saveLauncherConfig(config);

  const startupResult = key === 'startup' ? applyStartupSetting(config.behaviorSettings.startup) : { ok: true };
  broadcastBehaviorSettings(config.behaviorSettings);

  return {
    ok: startupResult.ok,
    message: startupResult.ok ? '设置已更新。' : `设置已保存，但系统启动项更新失败：${startupResult.message}`,
    config,
    behaviorSettings: config.behaviorSettings
  };
}

function toFileUrl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const url = pathToFileURL(filePath);
  try {
    url.searchParams.set('v', String(Math.round(fs.statSync(filePath).mtimeMs)));
  } catch {
    // Best effort cache busting; a plain file URL is still valid.
  }
  return url.toString();
}

function findFirstExisting(paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;
}

function getWebpSize(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const chunk = buffer.toString('ascii', offset, offset + 4);
      const length = buffer.readUInt32LE(offset + 4);
      const data = offset + 8;
      if (chunk === 'VP8X') {
        return {
          width: 1 + buffer.readUIntLE(data + 4, 3),
          height: 1 + buffer.readUIntLE(data + 7, 3)
        };
      }
      if (chunk === 'VP8 ' && data + 10 < buffer.length) {
        return {
          width: buffer.readUInt16LE(data + 6) & 0x3fff,
          height: buffer.readUInt16LE(data + 8) & 0x3fff
        };
      }
      if (chunk === 'VP8L') {
        return {
          width: 1 + (((buffer[data + 2] & 0x3f) << 8) | buffer[data + 1]),
          height: 1 + (((buffer[data + 4] & 0x0f) << 10) | (buffer[data + 3] << 2) | ((buffer[data + 2] & 0xc0) >> 6))
        };
      }
      offset += 8 + length + (length % 2);
    }
  } catch {
    return null;
  }
  return null;
}

function getSpriteAtlasRows(filePath) {
  const size = getWebpSize(filePath);
  if (!size?.height) return 9;
  return Math.max(1, Math.round(size.height / 208));
}

function getDurationsForAction(state, frames) {
  const known = CODEX_ACTION_DURATIONS[state];
  if (known?.length === frames) return known;
  const fallback = FALLBACK_ROW_DURATIONS[frames];
  if (fallback) return fallback;
  return Array.from({ length: Math.max(1, frames) }, () => 150);
}

function getSpriteActionMap(root, fallbackRows = 9) {
  const manifest = readJson(path.join(root, 'assets', 'manifest.json'), null);
  if (Array.isArray(manifest?.rows) && manifest.rows.length) {
    return Object.fromEntries(manifest.rows.map((row) => {
      const state = String(row.state || `action-${row.row}`);
      const frames = Math.max(1, Number(row.frames) || 1);
      return [state, {
        row: Math.max(0, Number(row.row) || 0),
        frames,
        durations: getDurationsForAction(state, frames),
        description: row.description || ''
      }];
    }));
  }
  return Object.fromEntries(
    Object.entries(CODEX_ACTION_MAP)
      .filter(([, value]) => value.row < fallbackRows)
      .map(([key, value]) => [key, { ...value }])
  );
}

function getPetCandidates() {
  return [
    {
      id: 'luya',
      name: 'Luya',
      folderName: '路亚',
      theme: 'mint',
      trait: '安静巡游',
      description: '浅色像素桌宠，适合放在桌面角落陪伴工作。',
      tags: ['已打包', '托盘菜单', '自动巡游']
    },
    {
      id: 'piko',
      name: 'Piko',
      folderName: 'piko',
      theme: 'pink',
      trait: '活泼互动',
      description: '支持悬停、单击、双击、拖拽和长时间未互动动作。',
      tags: ['已打包', '11 动作', '互动']
    },
    {
      id: 'mimo',
      name: 'Mimo',
      folderName: 'mimo',
      theme: 'violet',
      trait: '软萌待机',
      description: '适合做启动器的默认展示角色，素材完整。',
      tags: ['已打包', '素材完整', '动作包']
    }
  ];
}

function normalizePetId(value, fallback) {
  return String(value || fallback || 'pet')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pet';
}

function getCodexPetRoots(config) {
  const roots = [
    ...DEFAULT_CODEX_PET_ROOTS,
    ...(Array.isArray(config.codexPetRoots) ? config.codexPetRoots : [])
  ];
  return [...new Set(roots.filter(Boolean).map((root) => path.normalize(root)))];
}

function getDefaultCodexPetRoot() {
  return DEFAULT_CODEX_PET_ROOTS.find((root) => fs.existsSync(root)) ?? app.getPath('pictures');
}

function findCodexPetFolders(rootPath) {
  if (!rootPath || !fs.existsSync(rootPath)) return [];
  const petJsonPath = path.join(rootPath, 'pet.json');
  const spritePath = path.join(rootPath, 'spritesheet.webp');
  if (fs.existsSync(petJsonPath) && fs.existsSync(spritePath)) return [rootPath];

  try {
    return fs.readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootPath, entry.name))
      .filter((folder) => fs.existsSync(path.join(folder, 'pet.json')) && fs.existsSync(path.join(folder, 'spritesheet.webp')));
  } catch {
    return [];
  }
}

function discoverCodexPets(config) {
  const seen = new Set();
  const themes = ['blue', 'red', 'purple'];
  const folders = getCodexPetRoots(config).flatMap(findCodexPetFolders);

  return folders.flatMap((folder, index) => {
    const petJson = readJson(path.join(folder, 'pet.json'), null);
    if (!petJson) return [];

    const slug = normalizePetId(petJson.id, path.basename(folder, '.codex-pet'));
    const id = `codex:${slug}`;
    if (seen.has(id)) return [];
    seen.add(id);

    const spritesheetPath = path.join(folder, petJson.spritesheetPath || 'spritesheet.webp');
    if (!fs.existsSync(spritesheetPath)) return [];
    const atlasRows = getSpriteAtlasRows(spritesheetPath);
    const actionMap = getSpriteActionMap(folder, atlasRows);

    return [{
      id,
      name: config.petNames?.[id] || petJson.displayName || petJson.name || slug,
      folderName: path.basename(folder),
      theme: themes[index % themes.length],
      trait: petJson.kind || 'codex-pet',
      description: petJson.description || 'Codex 9 动作桌宠包。',
      tags: ['codex-pet', '9 动作', '可预览'],
      root: folder,
      launchPath: folder,
      launchType: 'codex-pet',
      commandPath: null,
      exePath: null,
      configPath: path.join(folder, 'pet.json'),
      iconPath: spritesheetPath,
      portraitPath: spritesheetPath,
      previewPath: spritesheetPath,
      spritesheetPath,
      spriteAtlasRows: atlasRows,
      iconUrl: toFileUrl(spritesheetPath),
      portraitUrl: toFileUrl(spritesheetPath),
      previewUrl: toFileUrl(spritesheetPath),
      spritesheetUrl: toFileUrl(spritesheetPath),
      source: 'codex-pet',
      packageMeta: petJson,
      actionMap,
      exists: true,
      runnable: true,
      running: runningPets.has(id),
      lastLaunchTime: config.lastLaunchTimes?.[id] ?? null,
      runtimeConfig: {}
    }];
  });
}

function discoverBuiltInPets(config) {
  return getPetCandidates().map((pet) => {
    const root = path.join(PET_LIBRARY_ROOT, pet.folderName);
    const exeName = `${pet.name}.exe`;
    const lowerName = pet.name.toLowerCase();
    const exePath = findFirstExisting([
      path.join(root, 'dist', pet.name, exeName),
      path.join(root, 'build', pet.name, exeName)
    ]);
    const commandPath = findFirstExisting([
      path.join(root, `启动 ${pet.name}.cmd`),
      path.join(root, '用于桌面宠物开发', 'start-pet.cmd')
    ]);
    const configPath = findFirstExisting([
      path.join(root, `${lowerName}-config.json`),
      path.join(root, 'pet-config.json'),
      path.join(root, '用于桌面宠物开发', 'pet-config.json')
    ]);
    const iconPath = findFirstExisting([
      path.join(root, `${lowerName}-tray.png`),
      path.join(root, 'contact-sheet.png'),
      path.join(root, '用于桌面宠物开发', 'contact-sheet.png'),
      path.join(root, 'assets', 'spritesheet.webp')
    ]);
    const previewPath = findFirstExisting([
      path.join(root, 'contact-sheet.png'),
      path.join(root, '用于桌面宠物开发', 'contact-sheet.png'),
      path.join(root, 'assets', 'spritesheet-11.webp'),
      path.join(root, 'assets', 'spritesheet.webp')
    ]);
    const spritesheetPath = findFirstExisting([
      path.join(root, 'assets', 'spritesheet.webp'),
      path.join(root, 'assets', 'spritesheet-11.webp')
    ]);
    const atlasRows = getSpriteAtlasRows(spritesheetPath);
    const actionMap = getSpriteActionMap(root, atlasRows);
    const runtimeConfig = readJson(configPath, {});
    const portraitPath = findFirstExisting([
      path.join(__dirname, 'renderer', 'assets', 'portraits', `${pet.id}-idle.png`),
      iconPath
    ]);
    const actionUrls = {
      idle: toFileUrl(path.join(__dirname, 'renderer', 'assets', 'portraits', `${pet.id}-idle.png`)),
      jumping: toFileUrl(path.join(__dirname, 'renderer', 'assets', 'portraits', `${pet.id}-jumping.png`)),
      waving: toFileUrl(path.join(__dirname, 'renderer', 'assets', 'portraits', `${pet.id}-waving.png`)),
      running: toFileUrl(path.join(__dirname, 'renderer', 'assets', 'portraits', `${pet.id}-running.png`)),
      sleep: toFileUrl(path.join(__dirname, 'renderer', 'assets', 'portraits', `${pet.id}-sleep.png`))
    };

    return {
      ...pet,
      name: config.petNames?.[pet.id] || pet.name,
      root,
      launchPath: exePath ?? commandPath,
      launchType: exePath ? 'exe' : 'cmd',
      commandPath,
      exePath,
      configPath,
      iconPath,
      portraitPath,
      previewPath,
      iconUrl: toFileUrl(iconPath),
      portraitUrl: toFileUrl(portraitPath),
      previewUrl: toFileUrl(previewPath),
      spritesheetPath,
      spriteAtlasRows: atlasRows,
      spritesheetUrl: toFileUrl(spritesheetPath),
      source: spritesheetPath ? 'spritesheet-pet' : 'built-in',
      actionMap: spritesheetPath ? actionMap : null,
      actionUrls,
      exists: fs.existsSync(root),
      runnable: Boolean(exePath ?? commandPath),
      running: runningPets.has(pet.id),
      lastLaunchTime: config.lastLaunchTimes?.[pet.id] ?? null,
      runtimeConfig
    };
  });
}

function discoverPets() {
  const config = loadLauncherConfig();
  const hiddenPetIds = new Set(config.hiddenPetIds ?? []);
  return [
    ...discoverBuiltInPets(config),
    ...discoverCodexPets(config)
  ].filter((pet) => !hiddenPetIds.has(pet.id));
}

function createWindow(options = {}) {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 780,
    autoHideMenuBar: true,
    show: options.show ?? true,
    backgroundColor: '#eaf7ff',
    title: 'Pixel Pet Launcher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createDesktopPetWindow(pet) {
  const existing = desktopPetWindows.get(pet.id);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }

  const petWindow = new BrowserWindow({
    width: 430,
    height: 430,
    x: Math.max(0, Math.round((mainWindow?.getBounds().x ?? 80) + 80)),
    y: Math.max(0, Math.round((mainWindow?.getBounds().y ?? 80) + 120)),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  desktopPetWindows.set(pet.id, petWindow);
  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const behaviorSettings = loadLauncherConfig().behaviorSettings;
  petWindow.loadFile(path.join(__dirname, 'renderer', 'desktop-pet.html'), {
    query: {
      name: pet.name,
      sprite: pet.spritesheetUrl,
      rows: String(pet.spriteAtlasRows ?? 9),
      autoInteract: String(Boolean(behaviorSettings.auto))
    }
  });
  petWindow.once('closed', () => {
    desktopPetWindows.delete(pet.id);
    runningPets.delete(pet.id);
    const shouldSuppress = petWindow.__suppressPetsChanged || suppressedClosedPetIds.has(pet.id);
    suppressedClosedPetIds.delete(pet.id);
    if (!shouldSuppress) {
      mainWindow?.webContents.send('pets:changed', discoverPets());
    }
  });
  return petWindow;
}

function preparePetMenuWindow(petWindow, point = {}) {
  if (!petWindow || petWindow.isDestroyed()) return { ok: false };
  const bounds = petWindow.getBounds();
  const menuWidth = 196;
  const menuWindowHeight = 520;
  const menuHeight = 306;
  const gap = 8;
  const padding = 12;
  const scale = Math.min(2.4, Math.max(0.5, Number(point.scale) || 1));
  const petWidth = Math.ceil(192 * scale);
  const petHeight = Math.ceil(208 * scale);
  const nextWidth = Math.max(bounds.width, menuWidth + gap + petWidth + padding * 2);
  const nextHeight = Math.max(bounds.height, menuWindowHeight + padding * 2, petHeight + padding * 2);
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const petCenterX = bounds.x + bounds.width / 2;
  const petCenterY = bounds.y + bounds.height / 2;
  const canOpenRight = petCenterX + petWidth / 2 + gap + menuWidth <= workArea.x + workArea.width;
  const side = canOpenRight ? 'right' : 'left';
  const nextX = side === 'right'
    ? Math.min(Math.max(workArea.x, Math.round(petCenterX - petWidth / 2 - padding)), workArea.x + workArea.width - nextWidth)
    : Math.min(Math.max(workArea.x, Math.round(petCenterX + petWidth / 2 + padding - nextWidth)), workArea.x + workArea.width - nextWidth);
  const nextY = Math.min(
    Math.max(workArea.y, Math.round(petCenterY - nextHeight / 2)),
    workArea.y + workArea.height - nextHeight
  );
  const next = {
    x: Math.round(nextX),
    y: Math.round(nextY),
    width: Math.round(nextWidth),
    height: Math.round(nextHeight)
  };
  petWindow.__menuBounds = bounds;
  petWindow.__menuScaleChanged = false;
  petWindow.setBounds(next);
  const petLeftPx = Math.round(petCenterX - next.x);
  const petTopPx = Math.round(petCenterY - next.y);
  const menuLeft = side === 'right'
    ? Math.round(petLeftPx + petWidth / 2 + gap)
    : Math.round(petLeftPx - petWidth / 2 - gap - menuWidth);
  const menuTop = Math.round(Math.min(
    Math.max(padding, petTopPx - menuHeight / 2),
    next.height - menuHeight - padding
  ));
  return {
    ok: true,
    petLeft: `${petLeftPx}px`,
    petTop: `${petTopPx}px`,
    menuLeft,
    menuTop
  };
}

function restorePetMenuWindow(petWindow) {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (petWindow.__menuBounds && !petWindow.__menuScaleChanged) {
    petWindow.setBounds(petWindow.__menuBounds);
  }
  petWindow.__menuBounds = null;
  petWindow.__menuScaleChanged = false;
  petWindow.setAlwaysOnTop(true, 'floating');
}

function launchPet(petId) {
  const pet = discoverPets().find((item) => item.id === petId);
  if (!pet || !pet.runnable) {
    return { ok: false, message: '没有找到可启动文件。' };
  }

  try {
    if (pet.source === 'codex-pet') {
      const petWindow = createDesktopPetWindow(pet);
      runningPets.set(pet.id, { virtual: true, window: petWindow, startedAt: Date.now() });

      const config = loadLauncherConfig();
      config.selectedPetId = pet.id;
      config.lastLaunchTimes = {
        ...(config.lastLaunchTimes ?? {}),
        [pet.id]: new Date().toISOString()
      };
      saveLauncherConfig(config);

      const pets = discoverPets();
      mainWindow?.webContents.send('pets:changed', pets);
      return {
        ok: true,
        message: `${pet.name} 已启动到桌面。`,
        pets,
        config
      };
    }

    const child = spawn(pet.launchPath, [], {
      cwd: pet.root,
      shell: pet.launchType === 'cmd',
      detached: false,
      windowsHide: false,
      stdio: 'ignore'
    });

    runningPets.set(pet.id, child);
    child.once('exit', () => {
      runningPets.delete(pet.id);
      mainWindow?.webContents.send('pets:changed', discoverPets());
    });

    const config = loadLauncherConfig();
    config.selectedPetId = pet.id;
    config.lastLaunchTimes = {
      ...(config.lastLaunchTimes ?? {}),
      [pet.id]: new Date().toISOString()
    };
    saveLauncherConfig(config);

    return {
      ok: true,
      message: `${pet.name} 已启动。`,
      pets: discoverPets(),
      config
    };
  } catch (error) {
    return { ok: false, message: `启动失败：${error.message}` };
  }
}

function stopPet(petId, options = {}) {
  const notify = options.notify ?? true;
  const child = runningPets.get(petId);
  if (!child?.pid) {
    if (child?.virtual) {
      const petWindow = desktopPetWindows.get(petId);
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.__suppressPetsChanged = !notify;
        if (!notify) suppressedClosedPetIds.add(petId);
        petWindow.close();
      }
      desktopPetWindows.delete(petId);
      runningPets.delete(petId);
      const pets = discoverPets();
      if (notify) mainWindow?.webContents.send('pets:changed', pets);
      return { ok: true, message: '已停止桌宠包预览。', pets };
    }
    return { ok: false, message: '这个桌宠当前没有由启动器记录为运行中。' };
  }

  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], (error) => {
      runningPets.delete(petId);
      const pets = discoverPets();
      if (notify) mainWindow?.webContents.send('pets:changed', pets);
      resolve({
        ok: !error,
        message: error ? '关闭请求已发送，但系统没有确认成功。' : '已关闭桌宠进程。',
        pets
      });
    });
  });
}

async function runBehaviorSmoke() {
  const originalConfig = loadLauncherConfig();
  const results = [];
  const record = (name, ok, detail = {}) => results.push({ name, ok, ...detail });

  const startupResult = updateBehaviorSetting('startup', false);
  const startupOffConfig = loadLauncherConfig();
  const startupOffSystem = app.getLoginItemSettings().openAtLogin;
  const startupOnResult = updateBehaviorSetting('startup', true);
  const startupOnConfig = loadLauncherConfig();
  const startupOnSystem = app.getLoginItemSettings().openAtLogin;
  record('开机启动', startupResult.ok && startupOnResult.ok && startupOffConfig.behaviorSettings.startup === false && startupOnConfig.behaviorSettings.startup === true, {
    savedOff: startupOffConfig.behaviorSettings.startup,
    savedOn: startupOnConfig.behaviorSettings.startup,
    systemOff: startupOffSystem,
    systemOn: startupOnSystem
  });

  updateBehaviorSetting('auto', true);
  const pet = discoverPets().find((item) => item.source === 'codex-pet' && item.runnable);
  if (!pet) {
    record('自动互动', false, { reason: '没有找到 codex-pet 桌宠包' });
  } else {
    createWindow({ show: false });
    await new Promise((resolve) => mainWindow.webContents.once('did-finish-load', resolve));
    const petWindow = createDesktopPetWindow(pet);
    await new Promise((resolve) => petWindow.webContents.once('did-finish-load', resolve));
    const autoStateBefore = await petWindow.webContents.executeJavaScript('window.__desktopPetTest.getBehaviorSettings()');
    const autoTriggered = await petWindow.webContents.executeJavaScript('window.__desktopPetTest.runAutoInteractNow()');
    const actionAfter = await petWindow.webContents.executeJavaScript('window.__desktopPetTest.getCurrentAction()');
    record('自动互动', autoStateBefore.autoInteract === true && autoTriggered === true && actionAfter === 'waving', {
      autoEnabled: autoStateBefore.autoInteract,
      triggered: autoTriggered,
      actionAfter
    });

    petWindow.destroy();
    mainWindow.destroy();
  }

  originalConfig.behaviorSettings = {
    ...DEFAULT_BEHAVIOR_SETTINGS,
    ...(originalConfig.behaviorSettings ?? {})
  };
  saveLauncherConfig(originalConfig);
  applyStartupSetting(originalConfig.behaviorSettings.startup);

  console.log(JSON.stringify({ ok: results.every((item) => item.ok), results }, null, 2));
}

if (process.argv.includes('--smoke')) {
  app.whenReady().then(() => {
    const pets = discoverPets();
    console.log(JSON.stringify({
      libraryRoot: PET_LIBRARY_ROOT,
      petCount: pets.length,
      runnableCount: pets.filter((pet) => pet.runnable).length,
      pets: pets.map((pet) => ({
        id: pet.id,
        name: pet.name,
        runnable: pet.runnable,
        launchType: pet.launchType,
        launchPath: pet.launchPath,
        hasPreview: Boolean(pet.previewUrl)
      }))
    }, null, 2));
    app.quit();
  });
} else if (process.argv.includes('--behavior-smoke')) {
  app.whenReady().then(async () => {
    await runBehaviorSmoke();
    app.quit();
  });
} else if (process.argv.includes('--screenshot')) {
  app.whenReady().then(() => {
    createWindow({ show: false });
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await mainWindow.capturePage();
        const outputDir = path.join(__dirname, '..', 'qa');
        fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, 'launcher-screenshot.png');
        fs.writeFileSync(outputPath, image.toPNG());
        console.log(outputPath);
        app.quit();
      }, 800);
    });
  });
} else {
  app.whenReady().then(() => {
    applyStartupSetting(loadLauncherConfig().behaviorSettings.startup);
    createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('app:get-initial-state', () => {
  return {
    libraryRoot: PET_LIBRARY_ROOT,
    config: loadLauncherConfig(),
    pets: discoverPets()
  };
});

ipcMain.handle('pets:refresh', () => discoverPets());
ipcMain.handle('pets:launch', (_, petId) => launchPet(petId));
ipcMain.handle('pets:stop', (_, petId) => stopPet(petId));
ipcMain.handle('pets:remove', async (_, petId) => {
  suppressedClosedPetIds.add(petId);
  const config = loadLauncherConfig();
  config.hiddenPetIds = [...new Set([...(config.hiddenPetIds ?? []), petId])];
  if (config.selectedPetId === petId) {
    const nextPet = [
      ...discoverBuiltInPets(config),
      ...discoverCodexPets(config)
    ].find((pet) => pet.id !== petId && !config.hiddenPetIds.includes(pet.id));
    config.selectedPetId = nextPet?.id ?? null;
  }
  saveLauncherConfig(config);
  await stopPet(petId, { notify: false });
  const pets = discoverPets();
  return { ok: true, message: '已从启动器里移除这个桌宠。文件没有删除。', pets, config };
});
ipcMain.handle('pets:import-codex-pets', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Codex 桌宠包或宠物包目录',
    defaultPath: getDefaultCodexPetRoot(),
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, message: '已取消导入。', pets: discoverPets() };
  }

  const selectedPath = result.filePaths[0];
  const folders = findCodexPetFolders(selectedPath);
  if (!folders.length) {
    return { ok: false, message: '这个文件夹里没有找到 pet.json + spritesheet.webp。', pets: discoverPets() };
  }

  const config = loadLauncherConfig();
  config.codexPetRoots = [...new Set([...(config.codexPetRoots ?? []), selectedPath])];
  saveLauncherConfig(config);
  const pets = discoverPets();
  mainWindow?.webContents.send('pets:changed', pets);
  return { ok: true, message: `已导入 ${folders.length} 个桌宠包。`, pets, config };
});
ipcMain.handle('config:select-pet', (_, petId) => {
  const config = loadLauncherConfig();
  config.selectedPetId = petId;
  saveLauncherConfig(config);
  return config;
});
ipcMain.handle('config:set-behavior-setting', (_, key, enabled) => updateBehaviorSetting(key, enabled));
ipcMain.handle('pets:rename', (_, petId, nextName) => {
  const cleanName = String(nextName || '').trim().slice(0, 24);
  if (!petId || !cleanName) {
    return { ok: false, message: '名字不能为空。', pets: discoverPets(), config: loadLauncherConfig() };
  }
  const config = loadLauncherConfig();
  config.petNames = {
    ...(config.petNames ?? {}),
    [petId]: cleanName
  };
  saveLauncherConfig(config);
  const pets = discoverPets();
  mainWindow?.webContents.send('pets:changed', pets);
  return { ok: true, message: '已改名。', pets, config };
});
ipcMain.handle('shell:open-path', (_, targetPath) => {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return { ok: false, message: '路径不存在。' };
  }
  shell.showItemInFolder(targetPath);
  return { ok: true };
});
ipcMain.handle('shell:open-library', async () => {
  if (!fs.existsSync(PET_LIBRARY_ROOT)) {
    return { ok: false, message: '桌宠库目录不存在。' };
  }
  const error = await shell.openPath(PET_LIBRARY_ROOT);
  return {
    ok: !error,
    message: error || '已打开桌宠库文件夹。'
  };
});
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.handle('window:close', () => {
  mainWindow?.close();
});
ipcMain.on('desktop-pet:move-by', (event, delta) => {
  const petWindow = BrowserWindow.fromWebContents(event.sender);
  if (!petWindow || petWindow.isDestroyed()) return;
  const dx = Number(delta?.x) || 0;
  const dy = Number(delta?.y) || 0;
  if (!dx && !dy) return;
  const bounds = petWindow.getBounds();
  petWindow.setBounds({
    x: Math.round(bounds.x + dx),
    y: Math.round(bounds.y + dy),
    width: bounds.width,
    height: bounds.height
  });
});
ipcMain.on('desktop-pet:resize', (event, options) => {
  const petWindow = BrowserWindow.fromWebContents(event.sender);
  if (!petWindow || petWindow.isDestroyed()) return;
  const scale = Math.min(2.4, Math.max(0.5, Number(options?.scale) || 1));
  const bounds = petWindow.getBounds();
  const width = Math.max(430, Math.ceil(192 * scale + 64));
  const height = Math.max(430, Math.ceil(208 * scale + 64));
  if (bounds.width === width && bounds.height === height) return;
  petWindow.__menuScaleChanged = true;
  petWindow.setBounds({
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + (bounds.height - height) / 2),
    width,
    height
  });
});
function getDesktopPetTargetBounds(petWindow, target) {
  const bounds = petWindow.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  if (target === 'center') {
    return {
      x: Math.round(workArea.x + (workArea.width - bounds.width) / 2),
      y: Math.round(workArea.y + (workArea.height - bounds.height) / 2)
    };
  }
  if (target === 'bottom-right') {
    return {
      x: Math.round(workArea.x + workArea.width - bounds.width - 24),
      y: Math.round(workArea.y + workArea.height - bounds.height - 24)
    };
  }
  if (target === 'random') {
    const safeX = Math.max(0, workArea.width - bounds.width - 48);
    const safeY = Math.max(0, workArea.height - bounds.height - 48);
    return {
      x: Math.round(workArea.x + 24 + Math.random() * safeX),
      y: Math.round(workArea.y + 24 + Math.random() * safeY)
    };
  }
  return { x: bounds.x, y: bounds.y };
}

ipcMain.handle('desktop-pet:target-direction', (event, options = {}) => {
  const petWindow = BrowserWindow.fromWebContents(event.sender);
  if (!petWindow || petWindow.isDestroyed()) return { ok: false };
  const bounds = petWindow.getBounds();
  const target = getDesktopPetTargetBounds(petWindow, options.target);
  return {
    ok: true,
    direction: target.x >= bounds.x ? 'right' : 'left'
  };
});

ipcMain.handle('desktop-pet:travel', (event, options = {}) => {
  const petWindow = BrowserWindow.fromWebContents(event.sender);
  if (!petWindow || petWindow.isDestroyed()) return { ok: false };
  const start = petWindow.getBounds();
  const target = getDesktopPetTargetBounds(petWindow, options.target);
  const durationMs = Math.max(250, Math.min(15000, Number(options.durationMs) || 1800));
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (petWindow.isDestroyed()) {
        clearInterval(timer);
        resolve({ ok: false });
        return;
      }
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
      const ease = 1 - Math.pow(1 - progress, 3);
      petWindow.setBounds({
        x: Math.round(start.x + (target.x - start.x) * ease),
        y: Math.round(start.y + (target.y - start.y) * ease),
        width: start.width,
        height: start.height
      });
      if (progress >= 1) {
        clearInterval(timer);
        resolve({ ok: true });
      }
    }, 16);
  });
});
ipcMain.handle('desktop-pet:menu-open', (event, point) => {
  return preparePetMenuWindow(BrowserWindow.fromWebContents(event.sender), point);
});
ipcMain.handle('desktop-pet:menu-close', (event) => {
  restorePetMenuWindow(BrowserWindow.fromWebContents(event.sender));
  return { ok: true };
});
ipcMain.handle('desktop-pet:action', (event, action) => {
  const petWindow = BrowserWindow.fromWebContents(event.sender);
  if (!petWindow || petWindow.isDestroyed()) return { ok: false };
  const bounds = petWindow.getBounds();
  const display = require('electron').screen.getDisplayMatching(bounds).workArea;

  if (action === 'larger' || action === 'smaller') {
    const factor = action === 'larger' ? 1.12 : 0.9;
    const width = Math.min(420, Math.max(160, Math.round(bounds.width * factor)));
    const height = Math.min(460, Math.max(175, Math.round(bounds.height * factor)));
    petWindow.setBounds({ ...bounds, width, height });
    return { ok: true };
  }

  if (action === 'opacity') {
    return { ok: true };
  }

  if (action === 'bottom-right') {
    petWindow.setPosition(
      Math.round(display.x + display.width - bounds.width - 24),
      Math.round(display.y + display.height - bounds.height - 24)
    );
    return { ok: true };
  }

  if (action === 'close') {
    petWindow.close();
    return { ok: true };
  }

  return { ok: false };
});
