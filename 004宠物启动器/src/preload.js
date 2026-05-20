const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  getInitialState: () => ipcRenderer.invoke('app:get-initial-state'),
  refreshPets: () => ipcRenderer.invoke('pets:refresh'),
  importCodexPets: () => ipcRenderer.invoke('pets:import-codex-pets'),
  removePet: (petId) => ipcRenderer.invoke('pets:remove', petId),
  renamePet: (petId, nextName) => ipcRenderer.invoke('pets:rename', petId, nextName),
  launchPet: (petId) => ipcRenderer.invoke('pets:launch', petId),
  stopPet: (petId) => ipcRenderer.invoke('pets:stop', petId),
  selectPet: (petId) => ipcRenderer.invoke('config:select-pet', petId),
  setBehaviorSetting: (key, enabled) => ipcRenderer.invoke('config:set-behavior-setting', key, enabled),
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
  openLibrary: () => ipcRenderer.invoke('shell:open-library'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  moveDesktopPetBy: (delta) => ipcRenderer.send('desktop-pet:move-by', delta),
  resizeDesktopPet: (options) => ipcRenderer.send('desktop-pet:resize', options),
  getDesktopPetTargetDirection: (options) => ipcRenderer.invoke('desktop-pet:target-direction', options),
  travelDesktopPet: (options) => ipcRenderer.invoke('desktop-pet:travel', options),
  prepareDesktopPetMenu: (point) => ipcRenderer.invoke('desktop-pet:menu-open', point),
  closeDesktopPetMenu: () => ipcRenderer.invoke('desktop-pet:menu-close'),
  revealDesktopPetMenu: () => ipcRenderer.invoke('desktop-pet:menu-ready'),
  runDesktopPetAction: (action) => ipcRenderer.invoke('desktop-pet:action', action),
  onBehaviorSettingsChanged: (callback) => {
    const handler = (_, settings) => callback(settings);
    ipcRenderer.on('behavior-settings:changed', handler);
    return () => ipcRenderer.removeListener('behavior-settings:changed', handler);
  },
  onPetsChanged: (callback) => {
    const handler = (_, pets) => callback(pets);
    ipcRenderer.on('pets:changed', handler);
    return () => ipcRenderer.removeListener('pets:changed', handler);
  }
});
