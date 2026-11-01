'use strict';

// Her coding-agent sessions window (renderer/agents.html): the same live sessions as your phone's.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentsHost', {
  list: () => ipcRenderer.invoke('agents:list'),
  history: (id) => ipcRenderer.invoke('agents:history', id),
  projects: () => ipcRenderer.invoke('agents:projects'),
  start: (agent, project, resume) => ipcRenderer.invoke('agents:start', { agent, project, resume }),
  send: (id, text) => ipcRenderer.invoke('agents:send', { id, text }),
  answer: (id, askId, decision, text) => ipcRenderer.invoke('agents:answer', { id, askId, decision, text }),
  interrupt: (id) => ipcRenderer.invoke('agents:interrupt', id),
  close: (id) => ipcRenderer.invoke('agents:close', id),
  onEvent: (fn) => ipcRenderer.on('agents:event', (_e, evt) => fn(evt)),
});
