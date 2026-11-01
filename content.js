(() => {
  // 동일 탭에서 확장 팝업을 다시 열더라도 메시지 리스너가 중복 설치되지 않도록 합니다.
  if (globalThis.__dragRegionAutoClickerV1) return;
  globalThis.__dragRegionAutoClickerV1 = true;

  const MAX_Z = '2147483647';
  const state = {
    region: null,
    interval: null,
    count: 0,
    config: { cps: 5, mode: 'random', limit: 0 },
    selectionOverlay: null,
    highlight: null,
    hud: null,
    countLabel: null
  };

  const clamp = (value, min, max, fallback) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

  function applyConfig(input = {}) {
    state.config = {
      cps: clamp(Number(input.cps), 1, 30, 5),
      mode: input.mode === 'center' ? 'center' : 'random',
      limit: Math.floor(clamp(Number(input.limit), 0, 100000, 0))
    };
  }

  function build(tag, style, text) {
    const el = document.createElement(tag);
    Object.assign(el.style, style);
    if (text != null) el.textContent = text;
    return el;
  }

  function clearSelection() {
    if (!state.selectionOverlay) return;
    state.selectionOverlay.remove();
    state.selectionOverlay = null;
    document.removeEventListener('keydown', cancelSelectionKey, true);
  }

  function removeDisplay() {
    state.highlight?.remove();
    state.hud?.remove();
    state.highlight = null;
    state.hud = null;
    state.countLabel = null;
    document.removeEventListener('keydown', stopKey, true);
  }

  function stop() {
    clearSelection();
    if (state.interval != null) {
      window.clearInterval(state.interval);
      state.interval = null;
    }
    removeDisplay();
  }

  function cancelSelectionKey(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearSelection();
  }

  function stopKey(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stop();
  }

  function selectRegion() {
    stop();

    const overlay = build('div', {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh',
      background: 'rgba(12, 37, 65, 0.09)', zIndex: MAX_Z,
      cursor: 'crosshair', userSelect: 'none', touchAction: 'none'
    });
    overlay.dataset.dragAutoclicker = 'selection';
    const box = build('div', {
      display: 'none', position: 'fixed', left: '0', top: '0',
      border: '2px dashed #00a6fb', background: 'rgba(0,166,251,.18)',
      boxSizing: 'border-box', pointerEvents: 'none'
    });
    const help = build('div', {
      position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)',
      background: '#14253a', color: 'white', font: '600 14px system-ui,sans-serif',
      padding: '11px 17px', borderRadius: '11px', pointerEvents: 'none',
      boxShadow: '0 4px 18px #0004', whiteSpace: 'nowrap'
    }, '마우스로 클릭 범위를 드래그하세요 · Esc 취소');
    overlay.append(box, help);
    (document.documentElement || document.body).append(overlay);
    state.selectionOverlay = overlay;
    document.addEventListener('keydown', cancelSelectionKey, true);

    let start = null;
    const point = (e) => ({
      x: clamp(e.clientX, 0, window.innerWidth, 0),
      y: clamp(e.clientY, 0, window.innerHeight, 0)
    });
    const regionFrom = (a, b) => ({
      left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
      right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y)
    });
    function draw(region) {
      Object.assign(box.style, {
        display: 'block', left: `${region.left}px`, top: `${region.top}px`,
        width: `${region.right - region.left}px`, height: `${region.bottom - region.top}px`
      });
    }
    overlay.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      start = point(e);
      overlay.setPointerCapture(e.pointerId);
      draw(regionFrom(start, start));
    });
    overlay.addEventListener('pointermove', (e) => {
      if (!start) return;
      e.preventDefault();
      draw(regionFrom(start, point(e)));
    });
    overlay.addEventListener('pointerup', (e) => {
      if (!start) return;
      e.preventDefault();
      e.stopPropagation();
      const region = regionFrom(start, point(e));
      start = null;
      if (region.right - region.left < 6 || region.bottom - region.top < 6) {
        help.textContent = '가로·세로 6px 이상 드래그해 주세요 · Esc 취소';
        box.style.display = 'none';
        return;
      }
      clearSelection();
      state.region = region;
      startClicks();
    });
    overlay.addEventListener('pointercancel', () => { start = null; box.style.display = 'none'; });
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function createDisplay() {
    const r = state.region;
    state.highlight = build('div', {
      position: 'fixed', left: `${r.left}px`, top: `${r.top}px`,
      width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px`,
      border: '2px solid #16bdf2', background: 'rgba(22,189,242,.07)',
      boxShadow: 'inset 0 0 0 1px #ffffff77', borderRadius: '3px',
      zIndex: MAX_Z, pointerEvents: 'none', boxSizing: 'border-box'
    });
    state.highlight.dataset.dragAutoclicker = 'highlight';
    state.hud = build('div', {
      position: 'fixed', top: '12px', right: '12px', zIndex: MAX_Z,
      display: 'flex', alignItems: 'center', gap: '10px',
      background: '#15283d', color: 'white', padding: '9px 10px',
      borderRadius: '12px', boxShadow: '0 3px 20px #0005',
      font: '600 12px system-ui,sans-serif'
    });
    state.hud.dataset.dragAutoclicker = 'controls';
    state.countLabel = build('span', {}, '클릭 중 · 0회');
    const stopButton = build('button', {
      border: 'none', borderRadius: '8px', background: '#fa6379',
      color: '#171b28', padding: '7px 11px', cursor: 'pointer',
      font: '700 12px system-ui,sans-serif'
    }, '■ 정지');
    stopButton.type = 'button';
    stopButton.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); stop(); });
    state.hud.append(state.countLabel, stopButton);
    (document.documentElement || document.body).append(state.highlight, state.hud);
    document.addEventListener('keydown', stopKey, true);
  }

  function clickOnce() {
    if (!state.region) return;
    if (state.config.limit > 0 && state.count >= state.config.limit) { stop(); return; }

    // 지정 영역은 스크롤 문서 좌표가 아니라 현재 화면(뷰포트) 좌표입니다.
    const r = state.region;
    const left = Math.max(0, r.left + 2);
    const right = Math.min(window.innerWidth - 1, r.right - 2);
    const top = Math.max(0, r.top + 2);
    const bottom = Math.min(window.innerHeight - 1, r.bottom - 2);
    if (right <= left || bottom <= top) return;
    const x = state.config.mode === 'center' ? (left + right) / 2 : left + Math.random() * (right - left);
    const y = state.config.mode === 'center' ? (top + bottom) / 2 : top + Math.random() * (bottom - top);
    const target = document.elementFromPoint(x, y);
    if (!target || state.hud?.contains(target) || state.selectionOverlay?.contains(target)) return;

    // 웹페이지의 DOM 이벤트를 흉내 내는 방식입니다. 브라우저/OS의 실제 마우스 클릭과는 다릅니다.
    const base = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, screenX: window.screenX + x, screenY: window.screenY + y,
      button: 0, detail: 1
    };
    try {
      if (typeof PointerEvent === 'function') {
        target.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }));
      }
      target.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
      if (typeof PointerEvent === 'function') {
        target.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
      }
      target.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
      target.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
      state.count++;
      if (state.countLabel) state.countLabel.textContent = `클릭 중 · ${state.count.toLocaleString()}회`;
      if (state.config.limit > 0 && state.count >= state.config.limit) stop();
    } catch (err) {
      console.warn('[드래그 오토클릭] 클릭 실패:', err);
    }
  }

  function startClicks() {
    if (!state.region) return { ok: false, error: '먼저 드래그로 클릭 범위를 지정하세요.' };
    stop();
    state.count = 0;
    createDisplay();
    state.interval = window.setInterval(clickOnce, 1000 / state.config.cps);
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
      case 'SELECT':
        applyConfig(message.config);
        selectRegion();
        sendResponse({ ok: true });
        break;
      case 'START':
        applyConfig(message.config);
        sendResponse(startClicks());
        break;
      case 'STOP':
        stop();
        sendResponse({ ok: true });
        break;
      case 'STATUS':
        sendResponse({ ok: true, hasRegion: !!state.region, running: state.interval != null, count: state.count, config: state.config });
        break;
    }
  });
})();
