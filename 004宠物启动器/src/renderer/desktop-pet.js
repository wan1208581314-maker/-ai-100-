const params = new URLSearchParams(window.location.search);
const spriteUrl = params.get('sprite');
const petName = params.get('name') || '桌宠';
const spriteRows = Math.max(1, Number(params.get('rows') || 9));
const invertRunActions = params.get('invertRun') === 'true';
let autoInteractEnabled = params.get('autoInteract') === 'true';
const sprite = document.querySelector('.desktop-pet__sprite');
const bubble = document.querySelector('.desktop-pet__bubble');
const menu = document.querySelector('.desktop-pet-menu');
const menuSubmenu = document.querySelector('.desktop-pet-menu__submenu');
const root = document.querySelector('.desktop-pet');

const actions = {
  idle: { row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320] },
  runningRight: { row: 1, frames: 8, durations: [105, 105, 105, 105, 105, 105, 105, 105] },
  runningLeft: { row: 2, frames: 8, durations: [105, 105, 105, 105, 105, 105, 105, 105] },
  'running-right': { row: 1, frames: 8, durations: [105, 105, 105, 105, 105, 105, 105, 105] },
  'running-left': { row: 2, frames: 8, durations: [105, 105, 105, 105, 105, 105, 105, 105] },
  waving: { row: 3, frames: 4, durations: [140, 140, 140, 280] },
  jumping: { row: 4, frames: 5, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, frames: 8, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, frames: 6, durations: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, frames: 6, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, frames: 8, durations: [130, 130, 130, 130, 130, 130, 130, 180] }
};

const IDLE_SPEED_MULTIPLIER = 6;
const ACTION_SPEED_MULTIPLIER = 1.5;
const NEGLECT_DELAY_MS = 45 * 60 * 1000;
const AUTO_INTERACT_DELAY_MS = 15 * 60 * 1000;

let currentAction = 'idle';
let restoreTimer = null;
let frameTimer = null;
let neglectTimer = null;
let autoInteractTimer = null;
let bubbleTimer = null;
let scriptedMove = false;
let dragState = null;
let paused = false;
let petScale = 1;
let petOpacity = 1;
let actionPreviewLockUntil = 0;

function getRunAction(direction) {
  if (direction === 'right') return invertRunActions ? 'running-left' : 'running-right';
  if (direction === 'left') return invertRunActions ? 'running-right' : 'running-left';
  return 'running';
}

function setAction(actionName, options = {}) {
  const action = actions[actionName] ?? actions.idle;
  currentAction = actionName;
  window.clearTimeout(restoreTimer);
  window.clearTimeout(frameTimer);

  const rowStep = spriteRows > 1 ? 100 / (spriteRows - 1) : 0;
  sprite.style.setProperty('--sprite-rows', String(spriteRows));
  sprite.style.setProperty('--sprite-bg-y', `${spriteRows * 100}%`);
  sprite.style.setProperty('--sprite-row-y', `${action.row * rowStep}%`);

  const multiplier = actionName === 'idle' ? IDLE_SPEED_MULTIPLIER : ACTION_SPEED_MULTIPLIER;
  const durations = (action.durations ?? Array.from({ length: action.frames }, () => action.frameMs ?? 150))
    .map((duration) => duration * multiplier);
  let frame = 0;
  const tick = () => {
    if (paused) {
      frameTimer = window.setTimeout(tick, 100);
      return;
    }
    sprite.style.backgroundPositionX = `${(frame / 7) * 100}%`;
    const delay = durations[frame] ?? durations[durations.length - 1] ?? 150;
    frame = (frame + 1) % durations.length;
    frameTimer = window.setTimeout(tick, delay);
  };
  tick();

  if (options.returnToIdle) {
    const duration = durations.reduce((total, value) => total + value, 0);
    restoreTimer = window.setTimeout(() => setAction('idle'), duration * 1.6);
  }
}

function actionDurationMs(actionName) {
  const action = actions[actionName] ?? actions.idle;
  const multiplier = actionName === 'idle' ? IDLE_SPEED_MULTIPLIER : ACTION_SPEED_MULTIPLIER;
  return (action.durations ?? Array.from({ length: action.frames }, () => action.frameMs ?? 150))
    .reduce((total, duration) => total + duration * multiplier, 0);
}

function runActionOnce(actionName) {
  setAction(actionName);
  return new Promise((resolve) => {
    restoreTimer = window.setTimeout(resolve, actionDurationMs(actionName));
  });
}

function showMessageBubble(text = '有新消息') {
  window.clearTimeout(bubbleTimer);
  bubble.textContent = text;
  bubble.hidden = false;
  bubbleTimer = window.setTimeout(() => {
    bubble.hidden = true;
  }, 4200);
}

function hideMessageBubble() {
  window.clearTimeout(bubbleTimer);
  bubble.hidden = true;
}

async function setTravelAction(target) {
  const info = await window.launcher?.getDesktopPetTargetDirection?.({ target });
  if (info?.direction === 'left') {
    setAction(getRunAction('left'));
    return;
  }
  if (info?.direction === 'right') {
    setAction(getRunAction('right'));
    return;
  }
  setAction('running');
}

async function travelTo(target, durationMs = 1800) {
  scriptedMove = true;
  await setTravelAction(target);
  await window.launcher?.travelDesktopPet?.({ target, durationMs });
  scriptedMove = false;
}

async function triggerNeglect() {
  if (paused || dragState || !menu.hidden || currentAction === 'failed') return;
  hideMessageBubble();
  await travelTo('center', 2200);
  setAction('failed');
}

async function recoverFromFailed() {
  resetNeglectTimer();
  await runActionOnce('waiting');
  await travelTo('bottom-right', 2200);
  setAction('idle');
}

async function triggerAutoPlay() {
  if (!autoInteractEnabled || paused || dragState || !menu.hidden || currentAction === 'failed') return;
  resetNeglectTimer();
  await travelTo('random', 2200);
  setAction('running', { returnToIdle: true });
}

async function hideMenu() {
  const wasOpen = root.classList.contains('is-menu-open');
  menu.hidden = true;
  if (menuSubmenu) menuSubmenu.open = false;
  if (wasOpen) {
    await window.launcher?.closeDesktopPetMenu?.();
  }
  root.classList.remove('is-menu-open');
  root.style.removeProperty('--pet-left');
  root.style.removeProperty('--pet-top');
  if (wasOpen) {
    await window.launcher?.revealDesktopPetMenu?.();
  }
}

async function showMenu(event) {
  event.preventDefault();
  const placement = await window.launcher?.prepareDesktopPetMenu?.({
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
    scale: petScale
  });
  if (placement?.ok) {
    root.classList.add('is-menu-open');
    root.style.setProperty('--pet-left', placement.petLeft);
    root.style.setProperty('--pet-top', placement.petTop);
    menu.style.left = `${placement.menuLeft}px`;
    menu.style.top = `${placement.menuTop}px`;
  } else {
    menu.style.left = '12px';
    menu.style.top = '12px';
  }
  menu.hidden = false;
  await window.launcher?.revealDesktopPetMenu?.();
}

function applyPetSettings() {
  root.style.setProperty('--pet-scale', String(petScale));
  root.style.setProperty('--pet-opacity', String(petOpacity));
  document.querySelector('[data-setting-output="scale"]').value = petScale.toFixed(2);
  document.querySelector('[data-setting-output="opacity"]').value = petOpacity.toFixed(2);
  window.launcher?.resizeDesktopPet?.({ scale: petScale });
}

function resetNeglectTimer() {
  window.clearTimeout(neglectTimer);
  neglectTimer = window.setTimeout(triggerNeglect, NEGLECT_DELAY_MS);
}

function scheduleAutoInteract(delayMs = AUTO_INTERACT_DELAY_MS) {
  window.clearTimeout(autoInteractTimer);
  if (!autoInteractEnabled) return;
  autoInteractTimer = window.setTimeout(async () => {
    await triggerAutoPlay();
    scheduleAutoInteract();
  }, delayMs);
}

function runAutoInteractNowForTest() {
  if (!autoInteractEnabled || paused || dragState || !menu.hidden) return false;
  resetNeglectTimer();
  setAction('running', { returnToIdle: true });
  return true;
}

if (spriteUrl) {
  sprite.style.backgroundImage = `url("${spriteUrl}")`;
}

sprite.setAttribute('aria-label', petName);

sprite.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragState = {
    pointerId: event.pointerId,
    lastScreenX: event.screenX,
    lastScreenY: event.screenY,
    totalX: 0,
    totalY: 0,
    directionAction: null
  };
  sprite.setPointerCapture?.(event.pointerId);
});

sprite.addEventListener('pointermove', (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const dx = event.screenX - dragState.lastScreenX;
  const dy = event.screenY - dragState.lastScreenY;
  if (!dx && !dy) return;
  dragState.lastScreenX = event.screenX;
  dragState.lastScreenY = event.screenY;
  dragState.totalX += Math.abs(dx);
  dragState.totalY += Math.abs(dy);
  if (dx !== 0 && Math.abs(dx) >= Math.abs(dy) * 0.35) {
    const nextAction = getRunAction(dx > 0 ? 'right' : 'left');
    if (dragState.directionAction !== nextAction) {
      dragState.directionAction = nextAction;
      setAction(nextAction);
    }
  }
  window.launcher?.moveDesktopPetBy?.({ x: dx, y: dy });
});

function finishDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const wasMoving = dragState.totalX + dragState.totalY > 6;
  sprite.releasePointerCapture?.(event.pointerId);
  window.setTimeout(() => {
    dragState = null;
    if (wasMoving && (currentAction === 'running-left' || currentAction === 'running-right')) {
      setAction('idle');
    }
  }, 0);
}

sprite.addEventListener('pointerup', finishDrag);
sprite.addEventListener('pointercancel', finishDrag);

sprite.addEventListener('click', (event) => {
  if (dragState && dragState.totalX + dragState.totalY > 6) {
    event.preventDefault();
    return;
  }
  hideMessageBubble();
  if (currentAction === 'failed') {
    recoverFromFailed();
    return;
  }
  resetNeglectTimer();
  setAction('waiting', { returnToIdle: true });
});

sprite.addEventListener('dblclick', () => {
  hideMessageBubble();
  resetNeglectTimer();
  setAction('jumping', { returnToIdle: true });
});

sprite.addEventListener('pointerenter', () => {
  if (Date.now() < actionPreviewLockUntil) return;
  if (paused || dragState || scriptedMove || currentAction === 'failed') return;
  setAction('waving', { returnToIdle: true });
});

sprite.addEventListener('contextmenu', showMenu);

menu.addEventListener('click', async (event) => {
  const item = event.target.closest('[data-pet-menu-action]');
  if (!item) return;
  const action = item.dataset.petMenuAction;

  if (actions[action]) {
    actionPreviewLockUntil = Date.now() + actionDurationMs(action) + 1200;
    await hideMenu();
    resetNeglectTimer();
    if (action === 'review') showMessageBubble('有新消息');
    else hideMessageBubble();
    setAction(action);
    return;
  }

  if (action === 'pause') {
    await hideMenu();
    paused = !paused;
    return;
  }

  await hideMenu();
  await window.launcher?.runDesktopPetAction?.(action);
});

menu.addEventListener('input', (event) => {
  const input = event.target.closest('[data-pet-setting]');
  if (!input) return;
  const value = Number(input.value);
  if (input.dataset.petSetting === 'scale') petScale = value;
  if (input.dataset.petSetting === 'opacity') petOpacity = value;
  applyPetSettings();
});

document.addEventListener('pointerdown', (event) => {
  if (!menu.hidden && !event.target.closest('.desktop-pet-menu')) hideMenu();
});

window.launcher?.onBehaviorSettingsChanged?.((settings) => {
  autoInteractEnabled = settings.auto === true;
  if (!autoInteractEnabled) window.clearTimeout(autoInteractTimer);
  if (autoInteractEnabled) {
    resetNeglectTimer();
    if (currentAction === 'failed') setAction('idle');
  }
  scheduleAutoInteract();
});

window.__desktopPetTest = {
  getCurrentAction: () => currentAction,
  getBehaviorSettings: () => ({
    autoInteract: autoInteractEnabled
  }),
  runAutoInteractNow: runAutoInteractNowForTest
};

setAction('idle');
applyPetSettings();
resetNeglectTimer();
scheduleAutoInteract();
