const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectSvgFile: () => ipcRenderer.invoke('select-svg-file'),
  selectSavePath: (defaultName) => ipcRenderer.invoke('select-save-path', defaultName),
  renderVideoLocal: (jobData) => ipcRenderer.invoke('render-video-local', jobData),
  cancelVideoRender: () => ipcRenderer.invoke('cancel-video-render'),
  saveRenderedFile: (sourcePath, defaultName) => ipcRenderer.invoke('save-rendered-file', { sourcePath, defaultName }),
  onRenderProgress: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('render-progress', subscription);
    return () => ipcRenderer.removeListener('render-progress', subscription);
  }
});
