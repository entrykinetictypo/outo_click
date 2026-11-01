const $ = (id) => document.getElementById(id);
const defaults = { cps: 5, mode: 'random', limit: 0 };
let currentTabId = null;

const clamp = (n, min, max, fallback) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
const configFromUI = () => ({
  cps: clamp(Number($('cps').value), 1, 30, defaults.cps),
  mode: $('mode').value === 'center' ? 'center' : 'random',
  limit: Math.floor(clamp(Number($('limit').value), 0, 100000, defaults.limit))
});

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('활성화된 탭을 찾을 수 없습니다.');
  currentTabId = tab.id;
  return tab.id;
}

async function ensureContentScript(tabId) {
  // activeTab만 사용하므로 항상 실행 중인 사이트 전체를 감시하지 않습니다.
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

async function send(type, withConfig = false) {
  const tabId = currentTabId ?? await activeTab();
  if (withConfig) {
    const config = configFromUI();
    await chrome.storage.local.set({ clickerConfig: config });
    return chrome.tabs.sendMessage(tabId, { type, config });
  }
  return chrome.tabs.sendMessage(tabId, { type });
}

function explainError(error) {
  const raw = String(error?.message || error);
  if (/Cannot access|cannot be scripted|Missing host permission|chrome:\/\/|extensions gallery|The extensions gallery/i.test(raw)) {
    return '이 페이지는 확장 프로그램 실행이 제한되어 있습니다. 일반 웹사이트에서 사용하세요.';
  }
  if (/Receiving end does not exist|Could not establish connection/i.test(raw)) {
    return '이 탭에서 아직 범위를 지정하지 않았습니다.';
  }
  return '실행 실패: ' + raw;
}

async function action(type) {
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try {
    await activeTab();
    if (type === 'SELECT') await ensureContentScript(currentTabId);
    const result = await send(type, type !== 'STOP');
    if (!result?.ok) throw new Error(result?.error || '작업을 완료하지 못했습니다.');
    if (type === 'SELECT') {
      status('웹페이지에서 마우스를 드래그하세요.');
      window.close();
    } else if (type === 'START') {
      status('자동 클릭 시작! 웹페이지의 Esc 키로도 중지할 수 있습니다.');
    } else {
      status('자동 클릭이 정지되었습니다.');
    }
  } catch (error) {
    status(explainError(error), true);
  } finally {
    for (const button of document.querySelectorAll('button')) button.disabled = false;
  }
}

async function initialize() {
  try {
    const stored = await chrome.storage.local.get('clickerConfig');
    const config = { ...defaults, ...(stored.clickerConfig || {}) };
    $('cps').value = config.cps;
    $('mode').value = config.mode;
    $('limit').value = config.limit;
    await activeTab();
    try {
      const state = await send('STATUS');
      if (state?.running) status(`실행 중 · ${state.count}회 클릭 · ${state.config.cps}회/초`);
      else if (state?.hasRegion) status('범위가 지정되어 있습니다. 다시 시작할 수 있습니다.');
      else status('범위를 지정하면 자동 클릭이 시작됩니다.');
    } catch {
      status('드래그로 클릭 범위를 먼저 지정하세요.');
    }
  } catch (error) {
    status(explainError(error), true);
  }
}

$('select').addEventListener('click', () => action('SELECT'));
$('start').addEventListener('click', () => action('START'));
$('stop').addEventListener('click', () => action('STOP'));
initialize();
