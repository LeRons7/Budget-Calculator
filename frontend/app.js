
(function () {
  'use strict';

  const API_BASE = '/api';

  const TOKEN_KEY = 'budgetCalculator_token';
  const THEME_KEY = 'budgetCalculator_theme';

  const DEFAULT_RULES = [
    { name: 'Нужды',      percent: 50, color: '#6c8cff' },
    { name: 'Развлечения',    percent: 30, color: '#DAA520' },
    { name: 'Сбережения', percent: 20, color: '#35d07f' },
  ];

  const PRESETS = {
    '50-30-20': [
      { name: 'Нужды',      percent: 50, color: '#6c8cff' },
      { name: 'Развлечения',    percent: 30, color: '#DAA520' },
      { name: 'Сбережения', percent: 20, color: '#35d07f' },
    ],
    '70-20-10': [
      { name: 'Нужды',      percent: 70, color: '#6c8cff' },
      { name: 'Развлечения',    percent: 20, color: '#DAA520' },
      { name: 'Сбережения', percent: 10, color: '#35d07f' },
    ],
    '60-20-20': [
      { name: 'Нужды',      percent: 60, color: '#6c8cff' },
      { name: 'Развлечения',    percent: 20, color: '#DAA520' },
      { name: 'Сбережения', percent: 20, color: '#35d07f' },
    ],
  };

  const COLOR_PALETTE = [
    '#6c8cff', '#DAA520', '#35d07f', '#ffb648',
    '#ff6b6b', '#4dd0e1', '#f06292', '#9575cd',
  ];

  // =========================================================
  // 2. СОСТОЯНИЕ
  // =========================================================
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    user: null,
    rules: [...DEFAULT_RULES],
    currentDistribution: null,
    history: [],
  };

  // =========================================================
  // 3. УТИЛИТЫ
  // =========================================================
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const moneyFmt = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  });
  const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

  const dateFmt = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const fmtDate = (iso) => {
    if (!iso) return '—';
    try { return dateFmt.format(new Date(iso)); }
    catch { return '—'; }
  };

  const escapeHtml = (str) =>
    String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

  // Тост
  let toastTimer = null;
  function showToast(message, type = 'info') {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast toast--${type} toast--show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('toast--show');
    }, 3200);
  }

  // =========================================================
  // 4. HTTP-КЛИЕНТ
  // =========================================================

  async function apiFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch (networkErr) {
      throw new Error('Нет соединения с сервером');
    }

    if (res.status === 401) {
      logout(false);
      throw new Error('Сессия истекла, войдите снова');
    }

    if (res.status === 204) return null;

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch { data = { message: text }; }
    }

    if (!res.ok) {
      const msg = data?.error || data?.message || `Ошибка ${res.status}`;
      throw new Error(msg);
    }

    return data;
  }

  // =========================================================
  // 5. АУТЕНТИФИКАЦИЯ
  // =========================================================
  function setToken(token) {
    state.token = token;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function register(email, password) {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    state.user = data.user || { email };
    return data;
  }

  async function login(email, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    state.user = data.user || { email };
    return data;
  }

  async function loadMe() {
    if (!state.token) return null;
    try {
      state.user = await apiFetch('/auth/me');
      return state.user;
    } catch {
      logout(false);
      return null;
    }
  }

  function logout(showMessage = true) {
    setToken(null);
    state.user = null;
    updateAuthUI();
    if (showMessage) showToast('Вы вышли из аккаунта', 'info');
  }

  // =========================================================
  // 6. РАСПРЕДЕЛЕНИЕ
  // =========================================================
  /**
   * Считает распределение по текущим правилам.
   * Округление: последний элемент получает остаток,
   * чтобы сумма всегда точно совпадала с amount.
   */
  function calculateDistribution(amount) {
    const items = [];
    let allocated = 0;

    state.rules.forEach((rule, i) => {
      const isLast = i === state.rules.length - 1;
      let value;

      if (isLast) {
        value = amount - allocated; 
      } else {
        value = Math.round((amount * rule.percent) / 100);
        allocated += value;
      }

      items.push({
        name: rule.name,
        percent: Number(rule.percent),
        amount: value,
        color: rule.color,
      });
    });

    return { amount, items };
  }

  async function distribute(amount) {
     
    const local = calculateDistribution(amount);

    if (state.token) {
      const saved = await apiFetch('/distribute', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          items: local.items.map(({ name, percent, amount }) => ({
            name, percent, amount,
          })),
        }),
      });
      state.currentDistribution = saved;
      return saved;
    }

    state.currentDistribution = {
      id: null,
      amount,
      items: local.items,
      createdAt: new Date().toISOString(),
    };
    return state.currentDistribution;
  }

  // =========================================================
  // 7. ИСТОРИЯ
  // =========================================================
  async function fetchHistory() {
    if (!state.token) return [];
    const data = await apiFetch('/history');
    state.history = Array.isArray(data) ? data : [];
    return state.history;
  }

  async function deleteHistoryItem(id) {
    await apiFetch(`/history/${id}`, { method: 'DELETE' });
    state.history = state.history.filter((h) => h.id !== id);
  }

  async function clearHistory() {
    await apiFetch('/history', { method: 'DELETE' });
    state.history = [];
  }

  // =========================================================
  // 8. РЕНДЕР: РЕЗУЛЬТАТ
  // =========================================================
  function renderDistribution(dist) {
    const totalEl = $('#resultTotal');
    const donutValueEl = $('#donutValue');
    const breakdownEl = $('#breakdown');
    const saveBtn = $('#saveBtn');

    if (totalEl) totalEl.textContent = fmtMoney(dist.amount);
    if (donutValueEl) donutValueEl.textContent = fmtMoney(dist.amount);

    if (breakdownEl) {
      if (!dist.items || dist.items.length === 0) {
        breakdownEl.innerHTML =
          '<li class="breakdown__empty">Нет данных для отображения</li>';
      } else {
        breakdownEl.innerHTML = dist.items.map((item, i) => {
          const color = item.color
            || state.rules[i]?.color
            || COLOR_PALETTE[i % COLOR_PALETTE.length];

          return `
            <li class="breakdown__item">
              <span class="breakdown__dot" style="background:${color}"></span>
              <span class="breakdown__name">${escapeHtml(item.name)}</span>
              <span class="breakdown__percent">${item.percent}%</span>
              <span class="breakdown__amount">${fmtMoney(item.amount)}</span>
            </li>
          `;
        }).join('');
      }
    }

    renderDonut(dist.items || []);

    if (saveBtn) saveBtn.disabled = !state.token;
  }

  function renderDonut(items) {
    const donut = document.getElementById('donut');
    if (!donut) return;

    donut.querySelectorAll('.donut__seg').forEach((s) => s.remove());

    const totalPercent = items.reduce((sum, i) => sum + Number(i.percent || 0), 0);
    if (totalPercent <= 0) return;

    const sorted = [...items]
        .filter((i) => Number(i.percent) > 0)
        .sort((a, b) => Number(b.percent) - Number(a.percent));

    const NS = 'http://www.w3.org/2000/svg';

    let offset = 0;

    sorted.forEach((item) => {
        const percent = (Number(item.percent) / totalPercent) * 100;

        const seg = document.createElementNS(NS, 'circle');
        seg.setAttribute('class', 'donut__seg');
        seg.setAttribute('cx', '21');
        seg.setAttribute('cy', '21');
        seg.setAttribute('r', '15.9');

        seg.setAttribute('stroke-dasharray', `${percent} ${100 - percent}`);
        seg.setAttribute('stroke-dashoffset', -offset);

        // Цвет
        seg.style.stroke = item.color || randomBrightColor();

        donut.appendChild(seg);

        offset += percent;
    });
}
  // =========================================================
  // 9. РЕНДЕР: ИСТОРИЯ
  // =========================================================
  async function renderHistory() {
    const tbody = $('#historyBody');
    if (!tbody) return;

    if (!state.token) {
      tbody.innerHTML =
        '<tr class="table__empty"><td colspan="5">Войдите, чтобы видеть историю</td></tr>';
      return;
    }

    try {
      await fetchHistory();
    } catch (e) {
      tbody.innerHTML =
        `<tr class="table__empty"><td colspan="5">Ошибка: ${escapeHtml(e.message)}</td></tr>`;
      return;
    }

    if (state.history.length === 0) {
      tbody.innerHTML =
        '<tr class="table__empty"><td colspan="5">Пока пусто. Сохрани первое распределение.</td></tr>';
      return;
    }

    tbody.innerHTML = state.history.map((h) => {
      const saved = (h.items || [])
        .filter((i) =>
          /сбереж|save|накоп/i.test(i.name)
        )
        .reduce((sum, i) => sum + Number(i.amount || 0), 0);

      const scheme = (h.items || [])
        .map((i) => `${i.percent}%`)
        .join(' / ');

      return `
        <tr>
          <td data-label="Дата">${fmtDate(h.createdAt)}</td>
          <td data-label="Доход">${fmtMoney(h.amount)}</td>
          <td data-label="Отложено">${fmtMoney(saved)}</td>
          <td data-label="Схема">${escapeHtml(scheme)}</td>
          <td>
            <button
              class="btn btn--ghost btn--icon"
              data-del="${h.id}"
              title="Удалить"
              aria-label="Удалить запись"
            >✕</button>
          </td>
        </tr>
      `;
    }).join('');

    // Делегирование клика на удаление
    tbody.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.del;
        if (!confirm('Удалить эту запись?')) return;
        try {
          await deleteHistoryItem(id);
          renderHistory();
          showToast('Запись удалена', 'success');
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });
  }

  // =========================================================
  // 10. РЕНДЕР: ПРАВИЛА
  // =========================================================
  function renderRules() {
    const list = $('#ruleList');
    if (!list) return;

    list.innerHTML = state.rules.map((r, i) => `
      <li class="rule-item" data-idx="${i}">
        <span
          class="rule-item__dot"
          style="background:${r.color}"
          data-color="${i}"
          title="Сменить цвет"
        ></span>
        <input
          class="input rule-item__name"
          value="${escapeHtml(r.name)}"
          maxlength="32"
          data-name="${i}"
          aria-label="Название категории"
        />
        <div class="rule-item__percent-wrap">
          <input
            class="input rule-item__percent"
            type="number"
            min="0"
            max="100"
            step="1"
            value="${r.percent}"
            data-percent="${i}"
            aria-label="Процент"
          />
          <span>%</span>
        </div>
        <button
          class="btn btn--ghost btn--icon"
          data-remove="${i}"
          title="Удалить"
          aria-label="Удалить категорию"
        >✕</button>
      </li>
    `).join('');

    list.querySelectorAll('[data-name]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const i = Number(inp.dataset.name);
        state.rules[i].name = inp.value;
      });
    });

    // Процент
    list.querySelectorAll('[data-percent]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const i = Number(inp.dataset.percent);
        let v = Number(inp.value);
        if (Number.isNaN(v)) v = 0;
        v = Math.max(0, Math.min(100, v));
        state.rules[i].percent = v;
        updateRulesTotal();
      });
      inp.addEventListener('blur', () => {
        const i = Number(inp.dataset.percent);
        inp.value = state.rules[i].percent;
      });
    });

    list.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.remove);
        if (state.rules.length <= 1) {
          showToast('Должна остаться хотя бы одна категория', 'error');
          return;
        }
        state.rules.splice(i, 1);
        renderRules();
        updateRulesTotal();
      });
    });

    list.querySelectorAll('[data-color]').forEach((dot) => {
      dot.addEventListener('click', () => {
        const i = Number(dot.dataset.color);
        const current = state.rules[i].color;
        const idx = COLOR_PALETTE.indexOf(current);
        const next = COLOR_PALETTE[(idx + 1) % COLOR_PALETTE.length];
        state.rules[i].color = next;
        dot.style.background = next;
      });
    });

    updateRulesTotal();
  }

  function updateRulesTotal() {
    const total = state.rules.reduce((s, r) => s + Number(r.percent || 0), 0);
    const el = $('#rulesTotal');
    if (!el) return;
    el.textContent = `${total}%`;
    el.style.color = total === 100
      ? 'var(--success)'
      : 'var(--danger)';
  }

  // =========================================================
  // 11. UI: АВТОРИЗАЦИЯ
  // =========================================================
  function updateAuthUI() {
    const btn = $('#loginBtn');
    if (!btn) return;

    if (state.user) {
      btn.textContent = state.user.email.split('@')[0];
      btn.classList.add('btn--ghost');
      btn.classList.remove('btn--primary');
      btn.title = 'Нажми, чтобы выйти';
    } else {
      btn.textContent = 'Войти';
      btn.classList.add('btn--primary');
      btn.classList.remove('btn--ghost');
      btn.title = '';
    }
  }

  function openAuthModal(mode = 'login') {
    const dialog = $('#authModal');
    if (!dialog) {
      return promptFallback(mode);
    }
    dialog.dataset.mode = mode;
    dialog.showModal?.();

    const title = $('#authTitle');
    const submitBtn = $('#authSubmit');
    if (title) {
      title.textContent = mode === 'register' ? 'Регистрация' : 'Вход';
    }
    if (submitBtn) {
      submitBtn.textContent = mode === 'register' ? 'Зарегистрироваться' : 'Войти';
    }
  }

  function promptFallback(mode) {
    const email = prompt('Email:');
    if (!email) return;
    const password = prompt('Пароль (мин. 8 символов):');
    if (!password) return;

    const action = mode === 'register' ? register : login;
    action(email, password)
      .then(async () => {
        showToast('Добро пожаловать!', 'success');
        updateAuthUI();
        await renderHistory();
      })
      .catch((e) => showToast(e.message, 'error'));
  }

  // =========================================================
  // 12. ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ
  // =========================================================
  function bindEvents() {

    const yearEl = $('#year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    $('#themeToggle')?.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
    });

    const form = $('#calcForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const input = $('#amount');
        const errorEl = $('#amountError');
        const amount = Number(input.value);

        if (!input.value || !amount || amount <= 0) {
          if (errorEl) errorEl.textContent = 'Введите сумму больше 0';
          input.classList.add('shake');
          setTimeout(() => input.classList.remove('shake'), 500);
          return;
        }
        if (errorEl) errorEl.textContent = '';

        const totalPercent = state.rules.reduce(
          (s, r) => s + Number(r.percent || 0), 0
        );
        if (totalPercent !== 100) {
          showToast(
            `Сумма процентов = ${totalPercent}%. Должна быть 100%`,
            'error'
          );
          return;
        }

        const btn = $('#distributeBtn');
        if (btn) btn.disabled = true;

        try {
          const dist = await distribute(amount);
          renderDistribution(dist);
          showToast('Готово!', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

    // --- Быстрые суммы ---
    $$('#quickAmounts .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const input = $('#amount');
        if (input) {
          input.value = chip.dataset.amount;
          input.focus();
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    // --- Пресеты ---
    $$('input[name="preset"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const preset = PRESETS[radio.value];
        if (preset) {
          state.rules = preset.map((r) => ({ ...r }));
          renderRules();
        }
      });
    });

    // --- Кнопка "Войти" / "Выйти" ---
    $('#loginBtn')?.addEventListener('click', () => {
      if (state.user) {
        if (confirm('Выйти из аккаунта?')) logout();
      } else {
        openAuthModal('login');
      }
    });

    // --- Кнопки в модалке авторизации ---
    const authForm = $('#authForm');
    if (authForm) {
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#authEmail').value.trim();
        const password = $('#authPassword').value;
        const mode = $('#authModal').dataset.mode || 'login';

        if (!email || !password) {
          showToast('Заполните все поля', 'error');
          return;
        }
        if (password.length < 8) {
          showToast('Пароль должен быть минимум 8 символов', 'error');
          return;
        }

        const submitBtn = $('#authSubmit');
        if (submitBtn) submitBtn.disabled = true;

        try {
          const action = mode === 'register' ? register : login;
          await action(email, password);
          showToast('Добро пожаловать!', 'success');
          updateAuthUI();
          $('#authModal').close?.();
          await renderHistory();
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // --- Переключение login/register в модалке ---
    $('#authSwitch')?.addEventListener('click', () => {
      const dialog = $('#authModal');
      const next = dialog.dataset.mode === 'register' ? 'login' : 'register';
      openAuthModal(next);
    });

    // --- Правила ---
    renderRules();

    $('#addRuleBtn')?.addEventListener('click', () => {
      const used = new Set(state.rules.map((r) => r.color));
      const free = COLOR_PALETTE.find((c) => !used.has(c)) || COLOR_PALETTE[0];
      state.rules.push({
        name: 'Новая категория',
        percent: 0,
        color: free,
      });
      renderRules();
    });

    $('#applyRulesBtn')?.addEventListener('click', () => {
      const total = state.rules.reduce((s, r) => s + Number(r.percent), 0);
      if (total !== 100) {
        showToast(`Сумма процентов = ${total}%. Нужно 100%`, 'error');
        return;
      }
      showToast('Правила применены', 'success');
    });

    // --- Сохранить в историю ---
    $('#saveBtn')?.addEventListener('click', async () => {
      if (!state.token) {
        showToast('Войдите, чтобы сохранять', 'error');
        openAuthModal('login');
        return;
      }
      if (!state.currentDistribution) {
        showToast('Сначала распредели сумму', 'error');
        return;
      }
      try {
        const dist = await distribute(state.currentDistribution.amount);
        state.currentDistribution = dist;
        await renderHistory();
        showToast('Сохранено', 'success');
      } catch (e) {
        showToast(e.message, 'error');
      }
    });

    // --- Очистить историю ---
    $('#clearHistoryBtn')?.addEventListener('click', async () => {
      if (!state.token) {
        showToast('Войдите, чтобы видеть историю', 'error');
        return;
      }
      if (!confirm('Удалить всю историю?')) return;
      try {
        await clearHistory();
        renderHistory();
        showToast('История очищена', 'success');
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  }

  // =========================================================
  // 13. ИНИЦИАЛИЗАЦИЯ
  // =========================================================
  async function init() {
    bindEvents();
    updateAuthUI();
    renderRules();

    // Если есть токен — проверяем, валиден ли он, и грузим историю
    if (state.token) {
      const user = await loadMe();
      if (user) {
        updateAuthUI();
        await renderHistory();
      }
    } else {
      await renderHistory(); 
    }

    // Публичный API для отладки из консоли
    window.bf = {
      state,
      login,
      register,
      logout,
      distribute: (amount) => distribute(amount).then(renderDistribution),
      fetchHistory,
      showToast,
    };

    console.info('[app] BudgetFlow готов. window.bf — для отладки.');
  }

  // Запуск после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
