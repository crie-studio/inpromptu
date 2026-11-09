'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = new Set([
  'settings:get', 'settings:set', 'settings:newRemoteToken', 'displays:list',
  'doc:get', 'file:open', 'file:read', 'file:save',
  'models:list', 'models:download',
  'session:start', 'session:stop', 'session:running',
  'overlay:init', 'remote:info', 'shortcuts:list', 'app:openExternal', 'app:openMicSettings', 'app:info',
  'recording:start', 'recording:stop', 'app:openRecordings',
  'obs:status', 'obs:reconnect', 'obs:setPassword', 'app:openSubtitles', 'app:showFile',
]);
const SEND = new Set([
  'doc:update', 'overlay:doc', 'overlay:state', 'overlay:stop', 'overlay:engine', 'overlay:mouse',
  'overlay:times', 'overlay:action', 'overlay:frame', 'engine:event', 'engine:recording',
]);
const ON = new Set([
  'settings:changed', 'models:progress', 'session:changed', 'session:error', 'session:page', 'session:state',
  'engine:cmd', 'engine:event', 'engine:status', 'overlay:cmd', 'overlay:frame', 'overlay:follower',
  'remote:changed', 'file:opened', 'recording:saved', 'obs:status', 'obs:notice', 'subtitles:saved',
]);

contextBridge.exposeInMainWorld('inpromptu', {
  invoke: (channel, ...args) => (INVOKE.has(channel)
    ? ipcRenderer.invoke(channel, ...args)
    : Promise.reject(new Error(`Canal não permitido: ${channel}`))),
  send: (channel, payload) => {
    if (SEND.has(channel)) ipcRenderer.send(channel, payload);
  },
  on: (channel, fn) => {
    if (!ON.has(channel)) return () => {};
    const handler = (_e, data) => fn(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
});
