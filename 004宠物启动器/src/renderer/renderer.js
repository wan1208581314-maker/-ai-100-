const state = {
  libraryRoot: '',
  pets: [],
  config: {},
  selectedPetId: null,
  selectedCardIndex: 0,
  stagePetPosition: {
    x: 50,
    y: 10.8
  },
  stagePetAction: 'idle',
  stagePetDrag: null,
  suppressNextStageClick: false,
  leftPanelScrollTop: 0,
  petLibraryScrollTop: 0,
  suppressPetsChangedUntil: 0,
  petLibraryOpen: false,
  actionPreviewOpen: false,
  behaviorSettings: {
    startup: true,
    hide: false,
    auto: false
  },
  busy: false,
  toast: null
};

const actionLabels = {
  idle: '待机',
  'running-right': '向右走',
  'running-left': '向左走',
  waving: '打招呼',
  jumping: '跳跃',
  failed: '冷落提醒',
  waiting: '点击互动',
  running: '游玩中',
  review: '看消息'
};

const codexActionFallback = {
  idle: { row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320] },
  'running-right': { row: 1, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  'running-left': { row: 2, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, frames: 4, durations: [140, 140, 140, 280] },
  jumping: { row: 4, frames: 5, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, frames: 8, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, frames: 6, durations: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, frames: 6, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, frames: 6, durations: [150, 150, 150, 150, 150, 280] }
};

const topResourceLabels = {
  heart: () => state.pets.length,
  coin: () => '--',
  gem: () => '--'
};

const IDLE_SPEED_MULTIPLIER = 6;
const ACTION_SPEED_MULTIPLIER = 1.5;

const leftSliderDrag = {
  active: false,
  pointerId: null,
  startY: 0,
  startScrollTop: 0
};

let spriteTimers = [];
let stageAutoTimer = null;

function formatTime(iso) {
  if (!iso) return '还没启动过';
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatRecentTime(iso) {
  if (!iso) return '还没启动过';
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const prefix = isToday ? '今天' : date.toDateString() === yesterday.toDateString() ? '昨天' : `${date.getMonth() + 1}/${date.getDate()}`;
  return `${prefix} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatOnlineDuration(iso) {
  if (!iso) return '刚刚在线';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return '1分钟内';
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}时${rest}分` : `${hours}小时`;
}

function getOnlineProgress(iso) {
  if (!iso) return 8;
  const minutes = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  return Math.min(100, Math.max(8, Math.round((minutes / 60) * 100)));
}

function getSelectedPet() {
  return state.pets.find((pet) => pet.id === state.selectedPetId) ?? state.pets[0] ?? null;
}

function getSelectedPetIndex() {
  return Math.max(0, state.selectedCardIndex);
}

function getInitialSelectedPetId(configSelectedPetId, pets) {
  const configuredPet = pets.find((pet) => pet.id === configSelectedPetId);
  if (configuredPet?.runnable || configuredPet?.running) return configuredPet.id;
  return pets.find((pet) => pet.runnable)?.id ?? configuredPet?.id ?? pets[0]?.id ?? null;
}

function getLeftCardSlots() {
  return state.pets.map((pet, index) => ({
    id: pet.id,
    pet,
    tone: ['blue', 'red', 'purple'][index % 3]
  }));
}

function sortPetsForLibrary(pets) {
  return [...pets].sort((a, b) => {
    const rank = (pet) => pet.running ? 0 : pet.runnable ? 1 : 2;
    const rankDiff = rank(a) - rank(b);
    if (rankDiff) return rankDiff;
    const aTime = a.lastLaunchTime ? new Date(a.lastLaunchTime).getTime() : 0;
    const bTime = b.lastLaunchTime ? new Date(b.lastLaunchTime).getTime() : 0;
    return bTime - aTime || a.name.localeCompare(b.name, 'zh-CN');
  });
}

function getDisplayName(pet, maxLength = 8) {
  const name = String(pet?.name ?? '');
  return name.length > maxLength ? `${name.slice(0, maxLength)}…` : name;
}

function getPortraitUrl(pet) {
  return pet.portraitUrl ?? pet.iconUrl ?? pet.previewUrl;
}

function getSpriteActionMeta(pet, action = 'idle') {
  return pet?.actionMap?.[action] ?? codexActionFallback[action] ?? codexActionFallback.idle;
}

function getActionEntries(pet) {
  if (pet?.actionMap && Object.keys(pet.actionMap).length) {
    return Object.entries(pet.actionMap)
      .sort(([, a], [, b]) => (a.row ?? 0) - (b.row ?? 0))
      .map(([key, meta]) => [key, `${meta.row ?? 0} ${key}`]);
  }
  return Object.keys(codexActionFallback).map((key) => [key, `${codexActionFallback[key].row} ${key}`]);
}

function getSpriteDurations(meta) {
  if (Array.isArray(meta.durations) && meta.durations.length) return meta.durations;
  const frames = Math.max(1, meta.frames ?? 1);
  const frameMs = meta.frameMs ?? Math.round((meta.duration ?? 1200) / frames);
  return Array.from({ length: frames }, () => frameMs);
}

function renderSpriteFrame(pet, className, action = 'idle', extraStyle = '') {
  if (!pet?.spritesheetUrl) return '';
  const meta = getSpriteActionMeta(pet, action);
  const frames = Math.max(1, meta.frames);
  const multiplier = action === 'idle' ? IDLE_SPEED_MULTIPLIER : ACTION_SPEED_MULTIPLIER;
  const durations = getSpriteDurations(meta).slice(0, frames).map((duration) => duration * multiplier);
  const atlasRows = Math.max(1, Number(pet.spriteAtlasRows ?? 9));
  const rowStep = atlasRows > 1 ? 100 / (atlasRows - 1) : 0;
  const style = `background-image:url('${escapeHtml(pet.spritesheetUrl)}');--sprite-rows:${atlasRows};--sprite-bg-y:${atlasRows * 100}%;--sprite-row-y:${meta.row * rowStep}%;${extraStyle}`;
  return `<span class="sprite-frame ${className}" data-sprite-player="true" data-sprite-durations="${escapeHtml(durations.join(','))}" style="${style}" aria-hidden="true"></span>`;
}

function renderPetAvatarContent(pet, action = 'idle') {
  if (pet?.spritesheetUrl) return renderSpriteFrame(pet, 'sprite-frame--avatar', action);
  const url = getCardAvatarUrl(pet);
  return url ? `<img src="${url}" alt="${escapeHtml(pet.name)}" />` : escapeHtml(pet?.name?.slice(0, 1) ?? '?');
}

function getCardAvatarUrl(pet) {
  const avatarMap = {
    luya: './assets/ui-pack/png/avatar_luya_card.png',
    piko: './assets/ui-pack/png/avatar_piko_card.png',
    mimo: './assets/ui-pack/png/avatar_mimo_card.png'
  };
  return avatarMap[pet.id] ?? getPortraitUrl(pet);
}

function getStagePetUrl(pet) {
  if (!pet) return null;
  if (pet.spritesheetUrl) return null;
  if (pet.actionUrls?.[state.stagePetAction]) return pet.actionUrls[state.stagePetAction];
  const stageMap = {
    luya: `./assets/portraits/luya-${state.stagePetAction}.png`,
    piko: `./assets/portraits/piko-${state.stagePetAction}.png`,
    mimo: `./assets/portraits/mimo-${state.stagePetAction}.png`
  };
  return stageMap[pet.id] ?? null;
}

function getStagePetAction(pet) {
  if (!pet?.spritesheetUrl) return null;
  return state.stagePetAction;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPetStatus(pet) {
  if (pet.running) return { label: 'RUNNING', tone: 'running', progress: 80 };
  if (pet.runnable) return { label: 'READY', tone: 'ready', progress: 42 };
  return { label: 'MISSING', tone: 'missing', progress: 8 };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setToast(message, type = 'info') {
  state.toast = { message, type };
  render();
  window.clearTimeout(setToast.timer);
  setToast.timer = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 2600);
}

function clearToast() {
  window.clearTimeout(setToast.timer);
  state.toast = null;
}

async function selectPet(petId) {
  const viewport = document.querySelector('.left-test-panel__viewport');
  if (viewport) state.leftPanelScrollTop = viewport.scrollTop;
  const slots = getLeftCardSlots();
  const slotIndex = slots.findIndex((slot) => slot.id === petId);
  state.selectedCardIndex = Math.max(0, slotIndex);
  state.stagePetAction = 'idle';
  if (!petId.startsWith('demo-')) {
    state.selectedPetId = petId;
    state.config = await window.launcher.selectPet(petId);
  }
  render();
}

async function selectPetFromLibrary(petId) {
  state.petLibraryOpen = false;
  await selectPet(petId);
}

function openPetLibrary() {
  state.petLibraryOpen = true;
  state.petLibraryScrollTop = 0;
  render();
}

function closePetLibrary() {
  state.petLibraryOpen = false;
  render();
}

function openActionPreview() {
  state.actionPreviewOpen = true;
  render();
}

function closeActionPreview() {
  state.actionPreviewOpen = false;
  render();
}

async function toggleBehaviorSetting(key) {
  if (!(key in state.behaviorSettings)) return;
  if (key === 'hide') {
    state.behaviorSettings.hide = false;
    render();
    await window.launcher.setBehaviorSetting('hide', false);
    return;
  }
  const nextValue = !state.behaviorSettings[key];
  state.behaviorSettings[key] = nextValue;
  render();
  const result = await window.launcher.setBehaviorSetting(key, nextValue);
  if (result.behaviorSettings) state.behaviorSettings = result.behaviorSettings;
  if (result.config) state.config = result.config;
  if (!result.ok) setToast(result.message, 'error');
  scheduleStageAutoInteract(state.behaviorSettings.auto ? 900 : undefined);
  render();
}

function scheduleStageAutoInteract(delayMs = 5000 + Math.round(Math.random() * 4000)) {
  window.clearTimeout(stageAutoTimer);
  if (!state.behaviorSettings.auto) return;
  stageAutoTimer = window.setTimeout(() => {
    const pet = getSelectedPet();
    if (!pet || !state.behaviorSettings.auto) return;
    const preferredActions = pet.spritesheetUrl
      ? ['waving', 'jumping', 'waiting', 'running', 'review']
      : ['waving', 'jumping', 'running'];
    const availableActions = preferredActions.filter((action) => (
      pet.spritesheetUrl ? Boolean(getSpriteActionMeta(pet, action)) : Boolean(pet.actionUrls?.[action])
    ));
    state.stagePetAction = availableActions[Math.floor(Math.random() * availableActions.length)] ?? 'idle';
    render();
    scheduleStageAutoInteract();
  }, delayMs);
}

function scrollLeftPanel(direction) {
  const viewport = document.querySelector('.left-test-panel__viewport');
  if (!viewport) return;
  state.leftPanelScrollTop = viewport.scrollTop;
  viewport.scrollBy({
    top: direction * viewport.clientHeight * 0.72,
    behavior: 'smooth'
  });
}

function moveStagePet(direction) {
  const step = 4;
  const next = { ...state.stagePetPosition };
  if (direction === 'left') next.x -= step;
  if (direction === 'right') next.x += step;
  if (direction === 'up') next.y += step;
  if (direction === 'down') next.y -= step;
  state.stagePetPosition = {
    x: clamp(next.x, 23, 77),
    y: clamp(next.y, 7.5, 45)
  };
  render();
}

function getLeftPanelScrollMax() {
  const viewport = document.querySelector('.left-test-panel__viewport');
  if (!viewport) return 0;
  return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
}

function updateLeftSlider() {
  const viewport = document.querySelector('.left-test-panel__viewport');
  const slider = document.querySelector('.left-test-panel__slider');
  const thumb = document.querySelector('.left-test-panel__slider-thumb');
  if (!viewport || !slider || !thumb) return;

  const maxScroll = getLeftPanelScrollMax();
  const trackHeight = slider.clientHeight;
  const thumbHeight = maxScroll > 0
    ? Math.max(trackHeight * (viewport.clientHeight / viewport.scrollHeight), trackHeight * 0.18)
    : trackHeight;
  const travel = Math.max(0, trackHeight - thumbHeight);
  const ratio = maxScroll > 0 ? viewport.scrollTop / maxScroll : 0;

  slider.classList.toggle('is-disabled', maxScroll <= 0);
  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${ratio * travel}px)`;
}

function scrollLeftPanelToSliderPoint(clientY) {
  const viewport = document.querySelector('.left-test-panel__viewport');
  const slider = document.querySelector('.left-test-panel__slider');
  const thumb = document.querySelector('.left-test-panel__slider-thumb');
  if (!viewport || !slider || !thumb) return;

  const maxScroll = getLeftPanelScrollMax();
  if (maxScroll <= 0) return;

  const rect = slider.getBoundingClientRect();
  const thumbHeight = thumb.getBoundingClientRect().height;
  const travel = Math.max(1, rect.height - thumbHeight);
  const localY = clientY - rect.top - thumbHeight / 2;
  const ratio = Math.max(0, Math.min(1, localY / travel));
  viewport.scrollTop = ratio * maxScroll;
  state.leftPanelScrollTop = viewport.scrollTop;
  updateLeftSlider();
}

async function refreshPets() {
  state.pets = await window.launcher.refreshPets();
  render();
}

async function launchSelectedPet() {
  const pet = getSelectedPet();
  if (!pet || state.busy) return;
  state.busy = true;
  render();
  const result = await window.launcher.launchPet(pet.id);
  state.busy = false;
  if (result.pets) state.pets = result.pets;
  if (result.config) state.config = result.config;
  setToast(result.message, result.ok ? 'success' : 'error');
}

async function stopSelectedPet() {
  const pet = getSelectedPet();
  if (!pet || state.busy) return;
  state.busy = true;
  render();
  const result = await window.launcher.stopPet(pet.id);
  state.busy = false;
  if (result.pets) state.pets = result.pets;
  setToast(result.message, result.ok ? 'success' : 'error');
}

async function openSelectedFolder() {
  const pet = getSelectedPet();
  if (!pet) return;
  const result = await window.launcher.openPath(pet.launchPath ?? pet.root);
  if (!result.ok) setToast(result.message, 'error');
}

async function openLibraryFolder() {
  const result = await window.launcher.openLibrary();
  setToast(result.message, result.ok ? 'success' : 'error');
}

async function importCodexPets() {
  if (state.busy) return;
  state.busy = true;
  render();
  const result = await window.launcher.importCodexPets();
  state.busy = false;
  if (result.pets) state.pets = result.pets;
  if (result.config) state.config = result.config;
  setToast(result.message, result.ok ? 'success' : 'error');
}

async function removePetFromLibrary(petId) {
  if (!petId || state.busy) return;
  const grid = document.querySelector('.pet-library-grid');
  if (grid) state.petLibraryScrollTop = grid.scrollTop;
  clearToast();
  state.busy = true;
  state.suppressPetsChangedUntil = Date.now() + 3000;
  const result = await window.launcher.removePet(petId);
  state.busy = false;
  if (result.pets) state.pets = result.pets;
  if (result.config) state.config = result.config;
  if (!state.pets.some((pet) => pet.id === state.selectedPetId)) {
    state.selectedPetId = state.config.selectedPetId ?? state.pets[0]?.id ?? null;
    state.selectedCardIndex = Math.max(0, state.pets.findIndex((pet) => pet.id === state.selectedPetId));
  }
  if (!result.ok) {
    setToast(result.message, 'error');
  } else {
    state.suppressPetsChangedUntil = Date.now() + 900;
    render();
  }
}

async function renamePetFromLibrary(petId) {
  const pet = state.pets.find((item) => item.id === petId);
  if (!pet || state.busy) return;
  const nextName = window.prompt('输入新的桌宠名字', pet.name);
  if (!nextName || nextName.trim() === pet.name) return;
  const grid = document.querySelector('.pet-library-grid');
  if (grid) state.petLibraryScrollTop = grid.scrollTop;
  clearToast();
  state.busy = true;
  const result = await window.launcher.renamePet(petId, nextName);
  state.busy = false;
  if (result.pets) state.pets = result.pets;
  if (result.config) state.config = result.config;
  if (!result.ok) {
    setToast(result.message, 'error');
  } else {
    render();
  }
}

function interactWithStagePet() {
  if (state.suppressNextStageClick) {
    state.suppressNextStageClick = false;
    return;
  }
  const pet = getSelectedPet();
  if (!pet) return;
  const sequence = pet.spritesheetUrl
    ? ['idle', 'waving', 'jumping', 'running', 'review']
    : ['idle', 'waving', 'jumping', 'running', 'sleep'];
  const index = sequence.indexOf(state.stagePetAction);
  state.stagePetAction = sequence[(index + 1) % sequence.length] ?? 'idle';
  render();
}

function moveStagePetToClientPoint(clientX, clientY, drag = {}) {
  const screen = document.querySelector('.middle-test-screen');
  if (!screen) return;
  const rect = screen.getBoundingClientRect();
  const x = ((clientX - rect.left - (drag.offsetX ?? 0)) / rect.width) * 100;
  const bottom = ((rect.bottom - clientY - (drag.offsetY ?? 0)) / rect.height) * 100;
  state.stagePetPosition = {
    x: clamp(x, 23, 77),
    y: clamp(bottom, 7.5, 45)
  };
}

function renderPetCard(pet) {
  const selected = pet.id === state.selectedPetId;
  const status = getPetStatus(pet);
  return `
    <button class="pet-card ${selected ? 'is-selected' : ''} status-${status.tone} theme-${pet.theme}" data-action="select" data-pet-id="${pet.id}">
      <span class="pet-card__avatar">
        ${renderPetAvatarContent(pet)}
      </span>
      <span class="pet-card__body">
        <strong>${escapeHtml(pet.name)}</strong>
        <small><i></i>${escapeHtml(status.label)}</small>
        <span class="pet-card__meter"><b style="width:${status.progress}%"></b></span>
      </span>
      <span class="pet-card__heart">♡</span>
    </button>
  `;
}

function renderTags(pet) {
  return pet.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
}

function renderConfigRows(pet) {
  const config = pet.runtimeConfig ?? {};
  const rows = [
    ['位置', config.x != null && config.y != null ? `${config.x}, ${config.y}` : '未记录'],
    ['缩放', config.scale != null ? `${Math.round(config.scale * 100)}%` : '默认'],
    ['透明度', config.alpha != null ? `${Math.round(config.alpha * 100)}%` : '默认'],
    ['自动巡游', config.auto_roam === false ? '关闭' : '开启']
  ];
  return rows.map(([label, value]) => `
    <div class="spec-row">
      <span>${label}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join('');
}

function renderActionPreview(pet) {
  const entries = [
    ['idle', '待机'],
    ['jumping', '跳跃'],
    ['waving', '挥手'],
    ['running', '巡游'],
    ['sleep', '休息']
  ];

  return entries.map(([key, label], index) => `
    <button class="motion-tile ${index === 0 ? 'is-active' : ''}" type="button">
      <span>${pet.actionUrls?.[key] ? `<img src="${pet.actionUrls[key]}" alt="" />` : getPortraitUrl(pet) ? `<img src="${getPortraitUrl(pet)}" alt="" />` : escapeHtml(pet.name.slice(0, 1))}</span>
      <small>${escapeHtml(label)}</small>
      <i>${escapeHtml(key)}</i>
    </button>
  `).join('');
}

function renderLeftCardSlots() {
  return getLeftCardSlots().map((slot, index) => {
    const selected = index === getSelectedPetIndex();
    const status = getPetStatus(slot.pet);
    return `
    <button class="left-card left-card--${slot.tone} ${selected ? 'is-selected' : ''}" type="button" data-action="select" data-pet-id="${escapeHtml(slot.id)}" aria-label="选择第 ${index + 1} 个卡带">
      <img class="left-card__frame" src="./assets/ui-pack/psd-left/${slot.tone === 'blue' ? '卡片1' : slot.tone === 'red' ? '卡片2' : '卡片3'}.png" alt="" />
      <span class="left-card__avatar">
        ${renderPetAvatarContent(slot.pet)}
      </span>
      <span class="left-card__name">${escapeHtml(slot.pet.name)}</span>
      <span class="left-card__status left-card__status--${status.tone}">
        <i></i>${escapeHtml(status.label)}
      </span>
      <span class="left-card__bond" aria-label="亲密度进度">
        <b></b>
      </span>
      ${selected ? '<span class="left-card__heart-fill" aria-hidden="true"></span>' : ''}
      ${selected ? '<img class="left-card__indicator" src="./assets/ui-pack/psd-left/按钮.png" alt="" />' : ''}
    </button>
  `;
  }).join('');
}

function renderPetLibraryTiles() {
  const tiles = sortPetsForLibrary(state.pets).map((pet) => {
    const selected = pet.id === state.selectedPetId;
    const status = getPetStatus(pet);
    return `
      <div class="pet-library-tile ${selected ? 'is-selected' : ''}" role="button" tabindex="0" data-action="select-library-pet" data-pet-id="${escapeHtml(pet.id)}" aria-label="选择 ${escapeHtml(pet.name)}">
        <span class="pet-library-tile__remove" role="button" data-action="remove-library-pet" data-pet-id="${escapeHtml(pet.id)}" aria-label="移除 ${escapeHtml(pet.name)}">×</span>
        <span class="pet-library-tile__avatar">
          ${renderPetAvatarContent(pet)}
        </span>
        <span class="pet-library-tile__name" title="${escapeHtml(pet.name)}">${escapeHtml(getDisplayName(pet))}</span>
        <span class="pet-library-tile__status is-${status.tone}"><i></i>${escapeHtml(status.label)}</span>
      </div>
    `;
  });

  tiles.push(`
    <button class="pet-library-tile pet-library-tile--add" type="button" data-action="import-codex-pets" aria-label="导入桌宠包">
      <span>+</span>
      <b>添加</b>
    </button>
  `);

  return tiles.join('');
}

function renderPetLibraryOverlay() {
  if (!state.petLibraryOpen) return '';
  return `
    <div class="pet-library-overlay" role="dialog" aria-modal="true" aria-label="桌宠仓库">
      <div class="pet-library-panel">
        <div class="pet-library-panel__header">
          <span>♡</span>
          <strong>桌宠仓库</strong>
          <button type="button" data-action="close-pet-library" aria-label="关闭桌宠仓库">×</button>
        </div>
        <div class="pet-library-grid">
          ${renderPetLibraryTiles()}
        </div>
      </div>
    </div>
  `;
}

function renderActionPreviewOverlay() {
  if (!state.actionPreviewOpen) return '';
  const pet = getSelectedPet();
  if (!pet) return '';
  const entries = [
    ...getActionEntries(pet)
  ];

  return `
    <div class="action-preview-overlay" role="dialog" aria-modal="true" aria-label="动作预览">
      <div class="action-preview-panel">
        <div class="action-preview-panel__header">
          <span>✦</span>
          <strong>${escapeHtml(getDisplayName(pet, 12))} 动作预览</strong>
          <button type="button" data-action="close-action-preview" aria-label="关闭动作预览">×</button>
        </div>
        <div class="action-preview-grid">
          ${entries.map(([key, label], index) => `
            <button class="action-preview-tile ${state.stagePetAction === key ? 'is-selected' : ''}" type="button" data-action="choose-stage-action" data-stage-action="${escapeHtml(key)}">
              <span class="action-preview-tile__visual">
                ${pet.spritesheetUrl
                  ? renderSpriteFrame(pet, 'action-preview-tile__sprite', key)
                  : pet.actionUrls?.[key]
                    ? `<img class="action-preview-tile__image action-preview-motion--${escapeHtml(key)}" src="${pet.actionUrls[key]}" alt="" />`
                    : getPortraitUrl(pet)
                      ? `<img class="action-preview-tile__image action-preview-motion--${escapeHtml(key)}" src="${getPortraitUrl(pet)}" alt="" />`
                      : escapeHtml(pet.name.slice(0, 1))}
              </span>
              <strong>${escapeHtml(label)}</strong>
              <small>${escapeHtml(actionLabels[key] ?? getSpriteActionMeta(pet, key).description ?? key)}</small>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderRecentPetRows() {
  return [...state.pets]
    .sort((a, b) => {
      const aTime = a.lastLaunchTime ? new Date(a.lastLaunchTime).getTime() : 0;
      const bTime = b.lastLaunchTime ? new Date(b.lastLaunchTime).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 3)
    .map((pet) => {
    const status = getPetStatus(pet);
    return `
      <div class="right-panel__recent-row is-${status.tone}">
        <span>${renderPetAvatarContent(pet)}</span>
        <strong>${escapeHtml(pet.name)}<small>${escapeHtml(formatRecentTime(pet.lastLaunchTime))}</small></strong>
        <em>${escapeHtml(status.label)}</em>
      </div>
    `;
  }).join('');
}

function renderRightPanel() {
  const pet = getSelectedPet();
  const onlinePet = state.pets.find((item) => item.running);
  const statusPet = onlinePet ?? pet;
  const status = getPetStatus(statusPet);
  const isOnline = Boolean(onlinePet);
  const path = pet?.launchPath ?? pet?.root ?? '';
  const onlineProgress = isOnline ? getOnlineProgress(onlinePet?.lastLaunchTime) : 0;

  return `
    <aside class="right-test-panel" aria-label="桌宠信息">
      <section class="right-panel-card right-panel-card--status">
        <img src="./assets/ui-pack/psd-right/status-clean.png" alt="" />
        <span class="right-panel__online-dot is-${status.tone}"></span>
        <strong class="right-panel__online-name is-${status.tone}">${escapeHtml(getDisplayName(statusPet ?? { name: '桌宠' }))} ${isOnline ? '在线' : escapeHtml(status.label)}</strong>
        <span class="right-panel__online-meter"><i style="width:${onlineProgress}%"></i></span>
        <em class="right-panel__online-time">${isOnline ? escapeHtml(formatOnlineDuration(onlinePet?.lastLaunchTime)) : ''}</em>
      </section>

      <section class="right-panel-card right-panel-card--path">
        <img src="./assets/ui-pack/psd-right/path.png" alt="" />
        <span class="right-panel__path-text">${escapeHtml(path)}</span>
        <img class="right-panel__browse-art" src="./assets/ui-pack/psd-right/browse-button.png" alt="" />
        <button class="right-panel__browse" type="button" data-action="open-folder" aria-label="打开当前桌宠文件夹"></button>
      </section>

      <section class="right-panel-card right-panel-card--behavior">
        <img src="./assets/ui-pack/psd-right/behavior.png" alt="" />
        <button class="right-panel__setting right-panel__setting--startup ${state.behaviorSettings.startup ? 'is-on' : 'is-off'}" type="button" data-action="toggle-setting" data-setting="startup">${state.behaviorSettings.startup ? 'ON' : 'OFF'}</button>
        <button class="right-panel__setting right-panel__setting--auto ${state.behaviorSettings.auto ? 'is-on' : 'is-off'}" type="button" data-action="toggle-setting" data-setting="auto">${state.behaviorSettings.auto ? 'ON' : 'OFF'}</button>
      </section>

      <section class="right-panel-card right-panel-card--recent">
        <img src="./assets/ui-pack/psd-right/recent.png" alt="" />
        <div class="right-panel__recent-list">
          ${renderRecentPetRows()}
        </div>
      </section>
    </aside>
  `;
}

function restoreLeftPanelScroll() {
  const viewport = document.querySelector('.left-test-panel__viewport');
  if (!viewport) return;
  viewport.scrollTop = state.leftPanelScrollTop;
  updateLeftSlider();
}

function restorePetLibraryScroll() {
  if (!state.petLibraryOpen) return;
  const grid = document.querySelector('.pet-library-grid');
  if (!grid) return;
  grid.scrollTop = state.petLibraryScrollTop;
}

function clearSpriteTimers() {
  spriteTimers.forEach((timer) => window.clearTimeout(timer));
  spriteTimers = [];
}

function setSpriteColumn(element, column) {
  element.style.backgroundPositionX = `${(column / 7) * 100}%`;
}

function startSpriteAnimations() {
  clearSpriteTimers();
  document.querySelectorAll('[data-sprite-player="true"]').forEach((element) => {
    const durations = String(element.dataset.spriteDurations ?? '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!durations.length) return;

    let frame = 0;
    const tick = () => {
      setSpriteColumn(element, frame);
      const delay = durations[frame] ?? durations[durations.length - 1];
      frame = (frame + 1) % durations.length;
      spriteTimers.push(window.setTimeout(tick, delay));
    };
    tick();
  });
}

function render() {
  const pet = getSelectedPet();
  const app = document.querySelector('#app');
  clearSpriteTimers();

  if (!pet) {
    app.innerHTML = `
      <main class="empty-shell">
        <div class="empty-window">
          <h1>Pixel Pet Launcher</h1>
          <p>没有发现桌宠。请检查 ${escapeHtml(state.libraryRoot || '桌宠库目录')}。</p>
          <button class="pixel-button pixel-button--primary" data-action="refresh">刷新</button>
        </div>
      </main>
    `;
    return;
  }

  app.innerHTML = `
    <main class="launcher-shell launcher-shell--top-test">
      <div class="psd-workbench" aria-label="Pixel Pet Launcher">
        <img class="psd-workbench__base" src="./assets/ui-pack/psd-base/base-shell.png" alt="" />
        <div class="top-test-bar" aria-label="Pixel Pet Launcher 顶部状态栏">
          <img class="top-test-bar__bg" src="./assets/ui-pack/psd-top/top-bar-bg.png" alt="" />
          <span class="top-test-bar__bunny" aria-hidden="true">
            <img src="./assets/ui-pack/psd-top/bunny.png" alt="" />
          </span>
          <span class="top-test-bar__wordmark" aria-hidden="true">
            <img src="./assets/ui-pack/psd-top/wordmark.png" alt="" />
            <i class="top-test-bar__sparkle top-test-bar__sparkle--left">✦</i>
            <i class="top-test-bar__sparkle top-test-bar__sparkle--right">✣</i>
          </span>
          <span class="top-test-bar__resource top-test-bar__resource--heart">${escapeHtml(topResourceLabels.heart())}</span>
          <span class="top-test-bar__resource top-test-bar__resource--coin"></span>
          <span class="top-test-bar__resource top-test-bar__resource--gem"></span>
          <button class="top-test-bar__window top-test-bar__window--minimize" data-action="window-minimize" aria-label="最小化">
            <img src="./assets/ui-pack/psd-top/window-minimize.png" alt="" />
          </button>
          <button class="top-test-bar__window top-test-bar__window--maximize" data-action="window-toggle-maximize" aria-label="最大化">
            <img src="./assets/ui-pack/psd-top/window-maximize.png" alt="" />
          </button>
          <button class="top-test-bar__window top-test-bar__window--close" data-action="window-close" aria-label="关闭">
            <img src="./assets/ui-pack/psd-top/window-close.png" alt="" />
          </button>
        </div>

        <section class="left-test-panel ${getLeftCardSlots().length > 3 ? 'is-scrollable' : ''}" aria-label="桌宠卡带">
          <img class="left-test-panel__art" src="./assets/ui-pack/psd-left/侧边.png" alt="" />
          <div class="left-test-panel__viewport">
            <div class="left-test-panel__track">
              ${renderLeftCardSlots()}
            </div>
          </div>
          <div class="left-test-panel__slider" data-action="left-slider-track">
            <button class="left-test-panel__slider-thumb" type="button" data-action="left-slider-thumb" aria-label="拖动滚动卡带列表"></button>
          </div>
          <button class="left-test-panel__scroll left-test-panel__scroll--up" data-action="scroll-left-up" aria-label="向上滚动">▲</button>
          <button class="left-test-panel__scroll left-test-panel__scroll--down" data-action="scroll-left-down" aria-label="向下滚动">▼</button>
          <img class="left-test-panel__add-art" src="./assets/ui-pack/psd-left/卡带.png" alt="" />
          <button class="left-test-panel__hotspot left-test-panel__hotspot--add" data-action="open-library" aria-label="打开文件夹添加桌宠"></button>
        </section>

        <section class="middle-test-screen" aria-label="桌宠预览屏幕">
          <img class="middle-test-screen__art" src="./assets/ui-pack/psd-middle/screen.png" alt="" />
          ${(getStagePetUrl(getSelectedPet()) || getSelectedPet()?.spritesheetUrl) ? `<span class="middle-test-screen__pet-shadow" style="--stage-pet-x:${state.stagePetPosition.x}%;--stage-pet-y:${state.stagePetPosition.y}%;"></span>` : ''}
          ${getSelectedPet()?.spritesheetUrl ? `<button class="middle-test-screen__pet-control" type="button" data-action="stage-pet" style="--stage-pet-x:${state.stagePetPosition.x}%;--stage-pet-y:${state.stagePetPosition.y}%;">${renderSpriteFrame(getSelectedPet(), 'middle-test-screen__pet middle-test-screen__pet--sprite', getStagePetAction(getSelectedPet()))}</button>` : ''}
          ${getStagePetUrl(getSelectedPet()) ? `<button class="middle-test-screen__pet-control" type="button" data-action="stage-pet" style="--stage-pet-x:${state.stagePetPosition.x}%;--stage-pet-y:${state.stagePetPosition.y}%;"><img class="middle-test-screen__pet" src="${getStagePetUrl(getSelectedPet())}" alt="${escapeHtml(getSelectedPet()?.name ?? '桌宠')}" /></button>` : ''}
          ${renderPetLibraryOverlay()}
          ${renderActionPreviewOverlay()}
        </section>

        <section class="middle-test-controls" aria-label="桌宠控制台">
          <img class="middle-test-controls__art" src="./assets/ui-pack/psd-middle/controls-group.png" alt="" />
          <button class="middle-test-controls__hotspot middle-test-controls__hotspot--dpad-up" data-action="move-stage-pet" data-direction="up" aria-label="向上移动角色"></button>
          <button class="middle-test-controls__hotspot middle-test-controls__hotspot--dpad-down" data-action="move-stage-pet" data-direction="down" aria-label="向下移动角色"></button>
          <button class="middle-test-controls__hotspot middle-test-controls__hotspot--dpad-left" data-action="move-stage-pet" data-direction="left" aria-label="向左移动角色"></button>
          <button class="middle-test-controls__hotspot middle-test-controls__hotspot--dpad-right" data-action="move-stage-pet" data-direction="right" aria-label="向右移动角色"></button>
          <button class="middle-test-controls__hotspot middle-test-controls__hotspot--launch" data-action="launch" aria-label="启动桌宠"></button>
          <button class="middle-test-controls__hotspot middle-test-controls__hotspot--stop" data-action="stop" aria-label="停止桌宠"></button>
          <button class="middle-test-controls__hotspot middle-test-controls__hotspot--switch" data-action="open-pet-library" aria-label="打开桌宠仓库"></button>
          <button class="middle-test-controls__hotspot middle-test-controls__hotspot--settings" data-action="open-action-preview" aria-label="打开动作预览"></button>
        </section>

        ${renderRightPanel()}
      </div>

      ${state.toast ? `<div class="toast toast--${state.toast.type}">${escapeHtml(state.toast.message)}</div>` : ''}
    </main>
  `;

  requestAnimationFrame(() => {
    restoreLeftPanelScroll();
    restorePetLibraryScroll();
    startSpriteAnimations();
  });
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const petId = target.dataset.petId;

  if (action === 'left-slider-track' || action === 'left-slider-thumb') return;
  if (action === 'select') selectPet(petId);
  if (action === 'select-library-pet') selectPetFromLibrary(petId);
  if (action === 'remove-library-pet') removePetFromLibrary(petId);
  if (action === 'rename-library-pet') renamePetFromLibrary(petId);
  if (action === 'refresh') refreshPets();
  if (action === 'launch') launchSelectedPet();
  if (action === 'stop') stopSelectedPet();
  if (action === 'open-pet-library') openPetLibrary();
  if (action === 'close-pet-library') closePetLibrary();
  if (action === 'open-action-preview') openActionPreview();
  if (action === 'close-action-preview') closeActionPreview();
  if (action === 'choose-stage-action') {
    state.stagePetAction = target.dataset.stageAction || 'idle';
    render();
  }
  if (action === 'toggle-setting') toggleBehaviorSetting(target.dataset.setting);
  if (action === 'open-folder') openSelectedFolder();
  if (action === 'open-library') importCodexPets();
  if (action === 'import-codex-pets') importCodexPets();
  if (action === 'scroll-left-up') scrollLeftPanel(-1);
  if (action === 'scroll-left-down') scrollLeftPanel(1);
  if (action === 'move-stage-pet') moveStagePet(target.dataset.direction);
  if (action === 'stage-pet') interactWithStagePet();
  if (action === 'window-minimize') window.launcher.minimizeWindow();
  if (action === 'window-toggle-maximize') window.launcher.toggleMaximizeWindow();
  if (action === 'window-close') window.launcher.closeWindow();
});

document.addEventListener('keydown', (event) => {
  const directionMap = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right'
  };
  const direction = directionMap[event.key];
  if (!direction) return;
  if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  moveStagePet(direction);
});

document.addEventListener('scroll', (event) => {
  if (event.target?.classList?.contains('left-test-panel__viewport')) {
    state.leftPanelScrollTop = event.target.scrollTop;
    updateLeftSlider();
  }
  if (event.target?.classList?.contains('pet-library-grid')) {
    state.petLibraryScrollTop = event.target.scrollTop;
  }
}, true);

document.addEventListener('pointerdown', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  if (target.dataset.action === 'left-slider-track') {
    event.preventDefault();
    scrollLeftPanelToSliderPoint(event.clientY);
  }

  if (target.dataset.action === 'left-slider-thumb') {
    const viewport = document.querySelector('.left-test-panel__viewport');
    if (!viewport) return;
    event.preventDefault();
    leftSliderDrag.active = true;
    leftSliderDrag.pointerId = event.pointerId;
    leftSliderDrag.startY = event.clientY;
    leftSliderDrag.startScrollTop = viewport.scrollTop;
    target.setPointerCapture?.(event.pointerId);
  }

  if (target.dataset.action === 'stage-pet') {
    event.preventDefault();
    const targetRect = target.getBoundingClientRect();
    state.stagePetDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - (targetRect.left + targetRect.width / 2),
      offsetY: targetRect.bottom - event.clientY,
      moved: false
    };
    target.setPointerCapture?.(event.pointerId);
  }
});

document.addEventListener('pointermove', (event) => {
  if (state.stagePetDrag?.pointerId === event.pointerId) {
    const dx = Math.abs(event.clientX - state.stagePetDrag.startX);
    const dy = Math.abs(event.clientY - state.stagePetDrag.startY);
    if (dx + dy > 4) state.stagePetDrag.moved = true;
    if (state.stagePetDrag.moved) {
      moveStagePetToClientPoint(event.clientX, event.clientY, state.stagePetDrag);
      render();
    }
    return;
  }

  if (!leftSliderDrag.active) return;
  const viewport = document.querySelector('.left-test-panel__viewport');
  const slider = document.querySelector('.left-test-panel__slider');
  const thumb = document.querySelector('.left-test-panel__slider-thumb');
  if (!viewport || !slider || !thumb) return;

  const maxScroll = getLeftPanelScrollMax();
  if (maxScroll <= 0) return;

  const thumbHeight = thumb.getBoundingClientRect().height;
  const travel = Math.max(1, slider.clientHeight - thumbHeight);
  const deltaY = event.clientY - leftSliderDrag.startY;
  viewport.scrollTop = leftSliderDrag.startScrollTop + (deltaY / travel) * maxScroll;
  state.leftPanelScrollTop = viewport.scrollTop;
  updateLeftSlider();
});

document.addEventListener('pointerup', (event) => {
  if (state.stagePetDrag?.pointerId === event.pointerId) {
    const wasMoved = state.stagePetDrag.moved;
    state.stagePetDrag = null;
    if (wasMoved) {
      state.suppressNextStageClick = true;
      event.preventDefault();
    }
    return;
  }

  if (leftSliderDrag.pointerId !== event.pointerId) return;
  leftSliderDrag.active = false;
  leftSliderDrag.pointerId = null;
});

document.addEventListener('pointercancel', (event) => {
  if (state.stagePetDrag?.pointerId === event.pointerId) {
    state.stagePetDrag = null;
    return;
  }

  if (leftSliderDrag.pointerId !== event.pointerId) return;
  leftSliderDrag.active = false;
  leftSliderDrag.pointerId = null;
});

async function boot() {
  const initialState = await window.launcher.getInitialState();
  state.libraryRoot = initialState.libraryRoot;
  state.pets = initialState.pets;
  state.config = initialState.config;
  state.behaviorSettings = {
    ...state.behaviorSettings,
    ...(initialState.config.behaviorSettings ?? {}),
    hide: false
  };
  state.selectedPetId = getInitialSelectedPetId(initialState.config.selectedPetId, state.pets);
  state.selectedCardIndex = Math.max(0, state.pets.findIndex((pet) => pet.id === state.selectedPetId));
  window.launcher.onBehaviorSettingsChanged((settings) => {
    state.behaviorSettings = {
      ...state.behaviorSettings,
      ...settings
    };
    scheduleStageAutoInteract(state.behaviorSettings.auto ? 900 : undefined);
    render();
  });
  window.launcher.onPetsChanged((pets) => {
    if (Date.now() < state.suppressPetsChangedUntil) return;
    state.pets = pets;
    render();
  });
  scheduleStageAutoInteract(state.behaviorSettings.auto ? 900 : undefined);
  render();
}

boot();
