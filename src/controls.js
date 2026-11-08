const icons = {
  pause: '<path d="M7 5v14M17 5v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  soundOff: '<path d="M11 5 6 9H3v6h3l5 4ZM16 9l6 6m0-6-6 6"/>',
  soundOn: '<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  settings: '<path d="M3 6h7m4 0h7M3 12h12m4 0h2M3 18h3m4 0h11M10 3v6m5 0v6m-9 0v6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  save: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  reset: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const defaults = Object.freeze({ preset: 'wired', relief: .65, diffusion: .42, light: .78, wire: .40, motion: .40 });
const sliders = [
  ['relief', 'Surface relief'], ['diffusion', 'Diffusion'], ['light', 'Light'],
  ['wire', 'Wire grid'], ['motion', 'Drift'],
];

/** Small, independent controls for the glass renderer. No render loop is owned here. */
export function setupControls({ onChange = () => {}, onPause = () => true, onSound = async () => false, onSave = () => {}, onReset = () => {} } = {}) {
  const values = { ...defaults };
  let playing = true;
  let soundBusy = false;
  let toastTimer;
  const abort = new AbortController();
  const listen = (node, event, handler, options = {}) => node.addEventListener(event, handler, { ...options, signal: abort.signal });
  const ui = document.createElement('div');
  ui.className = 'glass-ui';
  ui.innerHTML = `
    <header class="glass-wordmark"><h1>Glass</h1><p>A study in light</p></header>
    <button class="source-button" type="button" aria-label="View the background image" aria-haspopup="dialog">
      <img src="/source-thumbnail.jpg" alt="Stone sculpture and green foliage" width="76" height="76" draggable="false" />
      <span class="source-hint">View source <span aria-hidden="true">↗</span></span>
    </button>
    <div class="glass-toolbar" role="toolbar" aria-label="Scene controls">
      <button type="button" class="pause-button" title="Pause animation (Space)" aria-pressed="false">${icon('pause')}<span>Pause</span></button>
      <button type="button" class="sound-button" title="Toggle ambient sound" aria-pressed="false">${icon('soundOff')}<span>Sound off</span></button>
      <button type="button" class="settings-button" aria-haspopup="dialog" aria-expanded="false" aria-controls="glass-settings">${icon('settings')}<span>Settings</span></button>
    </div>
    <dialog class="glass-settings" id="glass-settings" aria-labelledby="settings-title">
      <div class="settings-heading"><h2 id="settings-title">The material</h2><button type="button" class="icon-button close-settings" aria-label="Close settings">${icon('close')}</button></div>
      <label class="preset-label" for="glass-preset">Glass finish</label>
      <div class="select-wrap"><select id="glass-preset" name="preset"><option value="wired">Wired</option><option value="frosted">Frosted</option><option value="fluted">Fluted</option><option value="clear">Clear</option></select><span aria-hidden="true">⌄</span></div>
      <div class="material-sliders">${sliders.map(([key, label]) => `
        <div class="range-control"><div class="range-label"><label for="glass-${key}">${label}</label><output for="glass-${key}" id="value-${key}">${Math.round(defaults[key] * 100)}</output></div>
        <input type="range" id="glass-${key}" name="${key}" min="0" max="1" step="0.01" value="${defaults[key]}" style="--progress:${defaults[key] * 100}%" /></div>`).join('')}
      </div>
      <div class="settings-actions"><button type="button" class="reset-button">${icon('reset')}<span>Reset</span></button><button type="button" class="fullscreen-button" aria-label="Enter fullscreen" title="Fullscreen">${icon('expand')}</button><button type="button" class="save-button" aria-label="Save an image" title="Save image">${icon('save')}</button></div>
      <p class="settings-hint">Move your pointer to move the light.<br><kbd>Space</kbd> to pause <span>·</span> <kbd>H</kbd> to hide controls</p>
    </dialog>
    <dialog class="source-dialog" aria-labelledby="source-title">
      <div class="source-heading"><div><h2 id="source-title">The garden</h2><p>Background reconstructed from the reference</p></div><button type="button" class="icon-button close-source" aria-label="Close background image">${icon('close')}</button></div>
      <img src="/garden-reconstructed.jpg" alt="A pale stone sculpture behind soft green foliage" draggable="false" />
    </dialog>
    <div class="glass-toast" role="status" aria-live="polite"></div>
  `;
  const app = document.getElementById('app') || document.body;
  app.append(ui);
  const $ = (selector) => ui.querySelector(selector);
  const settings = $('.glass-settings');
  const settingsButton = $('.settings-button');
  const source = $('.source-dialog');
  const sourceButton = $('.source-button');
  const pauseButton = $('.pause-button');
  const soundButton = $('.sound-button');
  const announce = (message) => {
    clearTimeout(toastTimer);
    $('.glass-toast').textContent = message;
    $('.glass-toast').classList.add('visible');
    toastTimer = setTimeout(() => $('.glass-toast').classList.remove('visible'), 2600);
  };
  const closeSettings = (focus = false) => {
    settings.close();
    settingsButton.setAttribute('aria-expanded', 'false');
    if (focus) settingsButton.focus();
  };
  const setHidden = (state) => {
    const hidden = Boolean(state);
    if (hidden) { closeSettings(); source.close(); }
    ui.classList.toggle('ui-hidden', hidden);
    // Keep the same visibility and keyboard state for shortcuts and clean URLs.
    for (const node of [$('.glass-wordmark'), sourceButton, $('.glass-toolbar')]) node.inert = hidden;
  };
  const setPlaying = (state) => {
    playing = Boolean(state);
    pauseButton.innerHTML = `${icon(playing ? 'pause' : 'play')}<span>${playing ? 'Pause' : 'Play'}</span>`;
    pauseButton.setAttribute('aria-pressed', String(!playing));
    pauseButton.title = `${playing ? 'Pause' : 'Play'} animation (Space)`;
  };
  const pause = () => setPlaying(onPause());
  listen(pauseButton, 'click', pause);
  listen(soundButton, 'click', async () => {
    if (soundBusy) return;
    soundBusy = true;
    soundButton.setAttribute('aria-busy', 'true');
    try {
      const enabled = await onSound();
      soundButton.innerHTML = `${icon(enabled ? 'soundOn' : 'soundOff')}<span>${enabled ? 'Sound on' : 'Sound off'}</span>`;
      soundButton.setAttribute('aria-pressed', String(Boolean(enabled)));
    } catch {
      announce('Sound is unavailable in this browser.');
    } finally {
      soundBusy = false;
      soundButton.removeAttribute('aria-busy');
    }
  });
  listen(settingsButton, 'click', () => {
    if (settings.open) { closeSettings(true); return; }
    settings.show();
    settingsButton.setAttribute('aria-expanded', 'true');
    $('#glass-preset').focus();
  });
  listen($('.close-settings'), 'click', () => closeSettings(true));
  listen(settings, 'close', () => settingsButton.setAttribute('aria-expanded', 'false'));
  listen(sourceButton, 'click', () => {
    closeSettings();
    source.showModal();
    $('.close-source').focus();
  });
  listen($('.close-source'), 'click', () => source.close());
  listen(source, 'close', () => sourceButton.focus());
  listen(source, 'click', (event) => {
    if (event.target !== source) return;
    const rect = source.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) source.close();
  });
  listen($('#glass-preset'), 'change', (event) => {
    values.preset = event.target.value;
    onChange('preset', values.preset);
  });
  for (const [key] of sliders) {
    listen($(`#glass-${key}`), 'input', (event) => {
      values[key] = Number(event.target.value);
      $(`#value-${key}`).value = Math.round(values[key] * 100);
      event.target.style.setProperty('--progress', `${values[key] * 100}%`);
      onChange(key, values[key]);
    });
  }
  listen($('.reset-button'), 'click', () => {
    Object.assign(values, defaults);
    $('#glass-preset').value = defaults.preset;
    for (const [key] of sliders) {
      $(`#glass-${key}`).value = defaults[key];
      $(`#glass-${key}`).style.setProperty('--progress', `${defaults[key] * 100}%`);
      $(`#value-${key}`).value = Math.round(defaults[key] * 100);
    }
    for (const [key, value] of Object.entries(values)) onChange(key, value);
    onReset();
    announce('Original material restored.');
  });
  const fullscreenButton = $('.fullscreen-button');
  if (!document.fullscreenEnabled) fullscreenButton.hidden = true;
  listen(fullscreenButton, 'click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { announce('Fullscreen is unavailable in this browser.'); }
  });
  listen(document, 'fullscreenchange', () => fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));
  listen($('.save-button'), 'click', async () => {
    try { await onSave(); announce('Image saved.'); }
    catch { announce('The image could not be saved.'); }
  });
  listen(document, 'pointerdown', (event) => {
    if (settings.open && !settings.contains(event.target) && !settingsButton.contains(event.target)) closeSettings();
  });
  listen(document, 'keydown', (event) => {
    if (event.key === 'Escape') {
      if (source.open) return; // Native modal dismissal also restores focus.
      if (settings.open) { event.preventDefault(); closeSettings(true); }
      else setHidden(false);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, [contenteditable="true"]') || source.open) return;
    if (event.code === 'Space' && !event.target.closest('button')) { event.preventDefault(); pause(); }
    if (event.key.toLowerCase() === 'h') setHidden(!ui.classList.contains('ui-hidden'));
  });
  return {
    values,
    setPlaying,
    setHidden,
    destroy() { clearTimeout(toastTimer); source.close(); settings.close(); abort.abort(); ui.remove(); },
  };
}
