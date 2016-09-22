'use strict';

var {ToggleButton} = require('sdk/ui/button/toggle');
var tabs = require('sdk/tabs');
var panels = require('sdk/panel');
var self = require('sdk/self');
var unload = require('sdk/system/unload');
var sp = require('sdk/simple-prefs');
var timers = require('sdk/timers');
var utils = require('sdk/window/utils');
var {getActiveView} = require('sdk/view/core');
var {Cu} = require('chrome');
var {Request} = require('sdk/request');

var panel, button, browser;
var {WebRequest} = Cu.import('resource://gre/modules/WebRequest.jsm', {});
var {MatchPattern} = Cu.import('resource://gre/modules/MatchPattern.jsm');

var last;
function update () {
  let now = (new Date()).getTime();
  if (last && now - last < sp.prefs.period * 1000) {
    return;
  }
  last = now;

  let id = /\/u\/(\d+)/.exec(sp.prefs.inbox);
  if (id && id.length) {
    id = id[1];
  }
  else {
    id = 0;
  }
  let request = new Request({
    url: 'https://mail.google.com/mail/u/' + id + '/feed/atom',
    onComplete: function (response) {
      let fullcount = /<fullcount\>(\d+)<\/fullcount\>/.exec(response.text);
      button.badge = fullcount && fullcount.length && fullcount[1] !== 0 ? fullcount[1] : '';
    }
  });
  request.get();
}

WebRequest.onCompleted.addListener(update, {
  urls: new MatchPattern([
    'https://inbox.google.com/sync/*',
    'http://www.google.com/accounts/*'
  ]),
  types: ['xmlhttprequest']
});
unload.when(() => WebRequest.onCompleted.removeListener(update));

button = new ToggleButton({
  id: self.name,
  label: 'Inbox Notifier',
  icon: {
    '16': './icons/16.png',
    '32': './icons/32.png',
    '64': './icons/64.png'
  },
  onChange: state => state.checked && panel.show({
    position: button
  })
});

panel = panels.Panel({
  contentURL: self.data.url('./panel/index.html'),
  contentScriptFile: self.data.url('./panel/index.js'),
  width: 40,
  height: sp.prefs.height,
  contextMenu: true,
  onHide: () => button.state('window', {checked: false})
});
panel.port.on('open', (url) => {
  panel.hide();
  tabs.open(url);
});
panel.port.on('refresh', () => {
  browser.loadURI(sp.prefs.inbox);
});
panel.port.on('settings', () => {
  panel.hide();
  utils.getMostRecentBrowserWindow().BrowserOpenAddonsMgr('addons://detail/' + self.id);
});
panel.port.on('pin', bol => getActiveView(panel).setAttribute('noautohide', bol));

browser = (function (panelView) {
  // display tooltips
  panelView.setAttribute('tooltip', 'aHTMLTooltip');
  // inbox.google.com cannot be loaded in an iframe; we use a safe browser element (type=content)
  //
  let b = panelView.ownerDocument.createElement('browser');
  b.setAttribute('type', 'content');
  b.setAttribute('style', `width: ${sp.prefs.width}px;`);
  panelView.appendChild(b);
  b.setAttribute('src', sp.prefs.inbox);
  return b;
})(getActiveView(panel));

sp.on('width', () => timers.setTimeout(() => {
  sp.prefs.width = Math.max(300, sp.prefs.width);
  browser.setAttribute('style', `width: ${sp.prefs.width}px;`);
}, 2000));
sp.on('height', () => timers.setTimeout(() => {
  sp.prefs.height = Math.max(300, sp.prefs.height);
  panel.height = sp.prefs.height;
}, 2000));
sp.on('period', () => timers.setTimeout(() => {
  sp.prefs.period = Math.max(10, sp.prefs.period);
}, 2000));
sp.on('inbox', () => timers.setTimeout(() => {
  if (sp.prefs.inbox.indexOf('inbox.google') === -1) {
    sp.prefs.inbox = 'https://inbox.google.com/u/0/';
  }
  panel.port.emit('inbox', sp.prefs.inbox);
  browser.loadURI(sp.prefs.inbox);
}, 2000));
panel.port.emit('inbox', sp.prefs.inbox);
