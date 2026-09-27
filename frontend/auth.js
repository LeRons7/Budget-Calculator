/* =========================================================
   BudgetFlow — страница авторизации (вход и регистрация)
   Зависимости: нет
   Требует: backend endpoints /api/auth/register и /api/auth/login
   ========================================================= */

(function () {
  'use strict';

  // =========================================================
  // 1. КОНФИГ
  // =========================================================
  const API_BASE = '/api';
  const TOKEN_KEY = 'budgetCalculator_token';
  const THEME_KEY = 'budgetCalculator_theme';

  // =========================================================
  // 2. УТИЛИТЫ
  // =========================================================
  const $ = (sel) => document.querySelector(sel);

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
  // 3. HTTP-КЛИЕНТ
  // =========================================================
  async function apiFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch {
      throw new Error('Нет соединения с сервером');
    }

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
  // 4. АУТЕНТИФИКАЦИЯ
  // =========================================================
  async function register(email, password) {
    return apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async function login(email, password) {
    return apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function hasToken() {
    return Boolean(localStorage.getItem(TOKEN_KEY));
  }

  // =========================================================
  // 5. ВАЛИДАЦИЯ
  // =========================================================
  function validateEmail(email) {
    if (!email) return 'Введите email';
    // Простая проверка: что-то@что-то.что-то
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Некорректный email';
    }
    return null;
  }

  function validatePassword(password) {
    if (!password) return 'Введите пароль';
    if (password.length < 8) return 'Пароль должен быть минимум 8 символов';
    return null;
  }

  // =========================================================
  // 6. UI: ПЕРЕКЛЮЧЕНИЕ РЕЖИМА
  // =========================================================
  function setMode(mode) {
    const isRegister = mode === 'register';

    const title = $('#authTitle');
    const subtitle = $('#authSubtitle');
    const loginForm = $('#loginForm');
    const registerForm = $('#registerForm');

    if (title) {
      title.textContent = isRegister ? 'Регистрация' : 'Вход';
    }
    if (subtitle) {
      subtitle.textContent = isRegister
        ? 'Создай аккаунт, чтобы сохранять распределения'
        : 'Войди, чтобы сохранять историю распределений';
    }

    if (loginForm) loginForm.hidden = isRegister;
    if (registerForm) registerForm.hidden = !isRegister;

    // Обновляем URL без перезагрузки
    const url = new URL(window.location.href);
    if (isRegister) {
      url.searchParams.set('mode', 'register');
    } else {
      url.searchParams.delete('mode');
    }
    window.history.replaceState({}, '', url);

    // Очищаем ошибки при переключении
    const loginError = $('#loginError');
    const registerError = $('#registerError');
    if (loginError) loginError.textContent = '';
    if (registerError) registerError.textContent = '';

    // Фокус на первое поле
    setTimeout(() => {
      const firstInput = isRegister ? $('#registerEmail') : $('#loginEmail');
      firstInput?.focus();
    }, 50);
  }

  function getModeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'register' ? 'register' : 'login';
  }

  // =========================================================
  // 7. UI: БЛОКИРОВКА КНОПКИ
  // =========================================================
  function lockButton(btn, text = 'Подождите...') {
    if (!btn) return () => {};
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span>${text}</span><span class="spinner"></span>`;
    return () => {
      btn.disabled = false;
      btn.innerHTML = original;
    };
  }

  // =========================================================
  // 8. ОБРАБОТКА ВХОДА
  // =========================================================
  function bindLoginForm() {
    const form = $('#loginForm');
    const errorEl = $('#loginError');
    const submitBtn = $('#loginSubmit');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorEl) errorEl.textContent = '';

      const email = $('#loginEmail').value.trim();
      const password = $('#loginPassword').value;

      // Клиентская валидация
      const emailErr = validateEmail(email);
      if (emailErr) {
        if (errorEl) errorEl.textContent = emailErr;
        return;
      }
      const passwordErr = validatePassword(password);
      if (passwordErr) {
        if (errorEl) errorEl.textContent = passwordErr;
        return;
      }

      const unlock = lockButton(submitBtn, 'Вход...');

      try {
        const data = await login(email, password);
        if (!data.token) throw new Error('Сервер не вернул токен');
        setToken(data.token);
        showToast('Успешный вход!', 'success');
        // Редирект на главную через 600 мс, чтобы тост успел показаться
        setTimeout(() => {
          window.location.href = '/';
        }, 600);
      } catch (err) {
        if (errorEl) errorEl.textContent = err.message;
        showToast(err.message, 'error');
        unlock();
      }
    });
  }

  // =========================================================
  // 9. ОБРАБОТКА РЕГИСТРАЦИИ
  // =========================================================
  function bindRegisterForm() {
    const form = $('#registerForm');
    const errorEl = $('#registerError');
    const submitBtn = $('#registerSubmit');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorEl) errorEl.textContent = '';

      const email = $('#registerEmail').value.trim();
      const password = $('#registerPassword').value;
      const confirm = $('#registerConfirm').value;

      // Клиентская валидация
      const emailErr = validateEmail(email);
      if (emailErr) {
        if (errorEl) errorEl.textContent = emailErr;
        return;
      }
      const passwordErr = validatePassword(password);
      if (passwordErr) {
        if (errorEl) errorEl.textContent = passwordErr;
        return;
      }
      if (password !== confirm) {
        if (errorEl) errorEl.textContent = 'Пароли не совпадают';
        return;
      }

      const unlock = lockButton(submitBtn, 'Регистрация...');

      try {
        const data = await register(email, password);
        if (!data.token) throw new Error('Сервер не вернул токен');
        setToken(data.token);
        showToast('Аккаунт создан!', 'success');
        setTimeout(() => {
          window.location.href = '/';
        }, 600);
      } catch (err) {
        if (errorEl) errorEl.textContent = err.message;
        showToast(err.message, 'error');
        unlock();
      }
    });
  }

  // =========================================================
  // 10. ССЫЛКИ ПЕРЕКЛЮЧЕНИЯ
  // =========================================================
  function bindSwitches() {
    document.querySelectorAll('[data-switch]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const mode = link.dataset.switch;
        setMode(mode);
      });
    });
  }

  // =========================================================
  // 11. ТЕМА
  // =========================================================
  function bindTheme() {
    const toggle = $('#themeToggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      document.documentElement.classList.add('theme-transition');
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
      }, 400);
    });
  }

  // =========================================================
  // 12. ИНИЦИАЛИЗАЦИЯ
  // =========================================================
  function init() {
    // Тема из localStorage
    const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Если уже вошёл — сразу на главную
    if (hasToken()) {
      window.location.href = '/';
      return;
    }

    // Режим из URL
    setMode(getModeFromUrl());

    // Обработчики
    bindLoginForm();
    bindRegisterForm();
    bindSwitches();
    bindTheme();

    console.info('[auth] страница авторизации готова');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();