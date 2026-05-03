/* popup.js — логика всплывающего окна расширения */

/** Выполнить функцию в контексте активной вкладки и вернуть результат. */
async function runInTab(func, args = []) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func,
    args,
  });
  return results[0]?.result;
}

/** Вывести сообщение в консоль активной вкладки. */
async function consoleLogInTab(...args) {
  return runInTab((...args) => console.log(...args), args);
}

/** Вывести сообщение об ошибке в консоль активной вкладки. */
async function consoleErrInTab(...args) {
  return runInTab((...args) => console.error(...args), args);
}

/** Проверить, есть ли на странице элемент #text-container. */
function checkTextContainer() {
  return runInTab(() => !!document.getElementById('text-container'));
}

/**
 * Извлечь текст из #text-container с нужными преобразованиями:
 * - <hX> и <p> → абзацы, отделённые пустой строкой
 * - <br> → перевод строки
 * - все прочие теги удаляются
 */
function extractChapterText() {
  return runInTab(() => {
    const container = document.getElementById('text-container');
    if (!container) return null;

    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const tag = node.tagName.toLowerCase();
      const inner = Array.from(node.childNodes).map(processNode).join('');

      if (/^h[1-6]$/.test(tag) || tag === 'p') {
        return '\n\n' + inner.trim() + '\n\n';
      }
      if (tag === 'br') {
        return '\n';
      }
      return inner;
    }

    const raw = Array.from(container.childNodes).map(processNode).join('');
    return raw
      .replace(/\n{3,}/g, '\n\n') // не более одной пустой строки подряд
      .trim();
  });
}

/** Показать уведомление «Скопировано» на странице. */
function showCopiedNotification() {
  return runInTab(() => {
    const ID = '__author_today_copier_notify__';
    const existing = document.getElementById(ID);
    if (existing) existing.remove();

    const notify = document.createElement('div');
    notify.id = ID;
    notify.textContent = 'Скопировано';
    notify.style.cssText = [
      'position:fixed',
      'top:20px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(0,0,0,0.78)',
      'color:#fff',
      'padding:12px 28px',
      'border-radius:8px',
      'font-size:16px',
      'font-family:sans-serif',
      'z-index:2147483647',
      'pointer-events:none',
      'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
    ].join(';');
    document.body.appendChild(notify);

    function dismiss() {
      notify.remove();
      document.removeEventListener('click', dismiss);
      document.removeEventListener('keypress', dismiss);
    }

    setTimeout(dismiss, 3000);
    document.addEventListener('click', dismiss);
    document.addEventListener('keypress', dismiss);
  });
}

/** Показать уведомление с результатом нейродетектора на странице. */
function showNeuroNotification(score, results) {
  return runInTab((score, results) => {
    const ID = '__author_today_neuro_notify__';
    const existing = document.getElementById(ID);
    if (existing) existing.remove();

    const notify = document.createElement('div');
    notify.id = ID;
    const percent = (score * 100).toFixed(2);
    notify.innerHTML =
      'Этот текст сгенерирован нейросетью с вероятностью<br>' +
      '<span style="font-size:150%">' + percent + '%</span>' +
      '<br><br><em>Кликни, чтобы скопировать полный результат анализа в формате JSON</em>'
      ;
    notify.style.cssText = [
      'position:fixed',
      'top:20px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(0,0,0,0.82)',
      'color:#fff',
      'padding:16px 32px',
      'border-radius:8px',
      'font-size:16px',
      'font-family:sans-serif',
      'z-index:2147483647',
      'text-align:center',
      'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
      'cursor:pointer',
    ].join(';');
    document.body.appendChild(notify);

    async function copyResults() {
      const textToCopy = JSON.stringify(results);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        return;
      }

      const area = document.createElement('textarea');
      area.value = textToCopy;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }

    function showCopiedBanner() {
      const copied = document.createElement('div');
      copied.textContent = 'Скопировано!';
      copied.style.cssText = [
        'position:fixed',
        'top:20px',
        'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(0,0,0,0.78)',
        'color:#fff',
        'padding:12px 28px',
        'border-radius:8px',
        'font-size:16px',
        'font-family:sans-serif',
        'z-index:2147483647',
        'pointer-events:none',
        'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
      ].join(';');
      document.body.appendChild(copied);
      setTimeout(() => copied.remove(), 3000);
    }

    function dismiss() {
      notify.remove();
      document.removeEventListener('click', onPageClick);
      document.removeEventListener('keypress', dismiss);
    }

    async function onPageClick(event) {
      if (notify.contains(event.target)) {
        try {
          await copyResults();
        } catch (e) {
          consoleErrInTab('[neurodetector] Не удалось скопировать results:', e);
        }
        dismiss();
        showCopiedBanner();
        return;
      }
      dismiss();
    }

    document.addEventListener('click', onPageClick);
    document.addEventListener('keypress', dismiss);
  }, [score, results]);
}

/** Показать уведомление об ошибке нейродетектора на странице. */
function showNeuroErrorNotification(errorText) {
  return runInTab((errorText) => {
    const ID = '__author_today_neuro_notify__';
    const existing = document.getElementById(ID);
    if (existing) existing.remove();

    const notify = document.createElement('div');
    notify.id = ID;
    console.log('[neurodetector] Показываем уведомление об ошибке:', errorText);
    notify.innerHTML = 'Запрос не удался<br>' + ( errorText ? '<em>' + errorText + '</em>' : 'Подробности в логе' );
    notify.style.cssText = [
      'position:fixed',
      'top:20px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(180,30,30,0.9)',
      'color:#fff',
      'padding:16px 32px',
      'border-radius:8px',
      'font-size:16px',
      'font-family:sans-serif',
      'z-index:2147483647',
      'text-align:center',
      'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
      'cursor:pointer',
    ].join(';');
    document.body.appendChild(notify);

    function dismiss() {
      notify.remove();
      document.removeEventListener('click', dismiss);
      document.removeEventListener('keypress', dismiss);
    }

    document.addEventListener('click', dismiss);
    document.addEventListener('keypress', dismiss);
  }, [errorText]);
}

/**
 * Отправить текст в нейродетектор Яндекса и вернуть данные ответа.
 * Запрос выполняется из контекста расширения (обход CORS через host_permissions).
 */
async function analyzeWithYandex(text) {
  console.log('[neurodetector] Отправляем запрос с текстом длиной', text.length);
  const body = JSON.stringify({ text });
  const response = await fetch('https://yandex.ru/lab/neurodetector/api/analyze/text', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    referrer: 'https://yandex.ru/lab/neurodetector',
    body,
    mode: 'cors',
    credentials: 'omit',
  });
  let result = await response.json();
  consoleLogInTab('[neurodetector] Ответ (сырой):', JSON.stringify(result));
  return result;
}

/* ── Инициализация popup ── */

document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.getElementById('copy-btn');
  const neuroBtn = document.getElementById('neuro-btn');
  const status = document.getElementById('status');

  try {
    const hasContainer = await checkTextContainer();
    if (hasContainer) {
      btn.disabled = false;
      neuroBtn.disabled = false;
      status.textContent = 'Глава найдена.';
    } else {
      btn.disabled = true;
      neuroBtn.disabled = true;
      status.textContent = 'На странице не найден текст произведения.';
    }
  } catch (e) {
    btn.disabled = true;
    neuroBtn.disabled = true;
    status.textContent = 'Не удалось проверить страницу.';
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.textContent = 'Копирование…';
    try {
      const text = await extractChapterText();
      if (!text) {
        status.textContent = 'Не удалось извлечь текст.';
        btn.disabled = false;
        return;
      }
      await navigator.clipboard.writeText(text);
      await showCopiedNotification();
      status.textContent = 'Текст скопирован!';
      setTimeout(() => window.close(), 1200);
    } catch (e) {
      status.textContent = 'Ошибка: ' + e.message;
      btn.disabled = false;
    }
  });

  neuroBtn.addEventListener('click', async () => {
    neuroBtn.disabled = true;
    btn.disabled = true;
    status.textContent = 'Отправка в нейродетектор…';
    try {
      const text = await extractChapterText();
      if (!text) {
        status.textContent = 'Не удалось извлечь текст.';
        neuroBtn.disabled = false;
        btn.disabled = false;
        return;
      }
      await navigator.clipboard.writeText(text);

      let data;
      try {
        data = await analyzeWithYandex(text);
      } catch (e) {
        consoleErrInTab('[neurodetector] Ошибка запроса:', e);
        await showNeuroErrorNotification(e.message);
        status.textContent = 'Не удалось выполнить запрос.';
        neuroBtn.disabled = false;
        btn.disabled = false;
        return;
      }
      consoleLogInTab('[neurodetector] Ответ:', JSON.stringify(data));

      if ("ok" in data) {
        consoleLogInTab('[neurodetector] Результат анализа:', data.results);
        if (data.ok === true && typeof data?.results?.statistics?.score === 'number') {
          await showNeuroNotification(data.results.statistics.score, data.results);
          status.textContent = 'Готово.';
        } else {
          consoleErrInTab('[neurodetector] Неожиданный формат данных.results:', data.results);
          await showNeuroErrorNotification('Неожиданный формат данных<br>' + JSON.stringify(data.results));
          status.textContent = 'Неожиданный формат ответа.';
        }
      } else if ("error" in data) {
        consoleErrInTab('[neurodetector] Ошибка в ответе:', data.error);
        await showNeuroErrorNotification(data.error);
        status.textContent = 'Ошибка в ответе.';
      } else {
        consoleErrInTab('[neurodetector] Неожиданный формат ответа:', data);
        await showNeuroErrorNotification('Неожиданный формат ответа');
        status.textContent = 'Неожиданный формат ответа.';
      }
      setTimeout(() => window.close(), 300);
    } catch (e) {
      consoleErrInTab('[neurodetector] Ошибка:', e);
      status.textContent = 'Ошибка: ' + e.message;
      neuroBtn.disabled = false;
      btn.disabled = false;
    }
  });
});
