/* =========================================================
   BudgetFlow — анимации и микро-интерактив
   Подключать после app.js
   Ничего не ломает: если элемента нет — просто пропускает.
   ========================================================= */

(function () {
  'use strict';

  // =========================================================
  // 0. Утилиты
  // =========================================================
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  // Если пользователь просил "меньше движения" — не мучаем его
  if (prefersReducedMotion) {
    console.info('[anim] reduced motion — анимации отключены');
    return;
  }

  // =========================================================
  // 1. Появление секций при скролле (IntersectionObserver)
  // =========================================================
  function initScrollReveal() {
    const targets = $$('.section, .hero__text, .hero__card, .card');

    if (!('IntersectionObserver' in window)) {
      // Фолбэк — просто показываем всё
      targets.forEach((el) => el.classList.add('revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );

    targets.forEach((el) => {
      el.classList.add('reveal');
      observer.observe(el);
    });
  }

  // =========================================================
  // 2. Плавный счётчик чисел (для hero-статистики)
  // =========================================================
  function animateNumber(el, from, to, duration = 900, formatter = (n) => Math.round(n).toString()) {
    if (!el) return;
    const start = performance.now();
    const diff = to - from;

    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const value = from + diff * eased;
      el.textContent = formatter(value);
      if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function initHeroCounters() {
    const distributed = $('#statDistributed');
    const saved = $('#statSaved');
    const operations = $('#statOperations');
    if (!distributed || !saved || !operations) return;

    const moneyFmt = (n) =>
      new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0,
      }).format(n);

    // Стартовые значения (потом можно заменить реальными из API)
    const startStats = { distributed: 0, saved: 0, operations: 0 };
    const endStats   = { distributed: 250000, saved: 50000, operations: 12 };

    const observer = new IntersectionObserver(
      (entries, obs) => {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();

        animateNumber(distributed, startStats.distributed, endStats.distributed, 1200, moneyFmt);
        animateNumber(saved, startStats.saved, endStats.saved, 1200, moneyFmt);
        animateNumber(operations, startStats.operations, endStats.operations, 1200);
      },
      { threshold: 0.4 }
    );

    observer.observe(distributed.closest('.hero__stats') || distributed);
  }

  // Публичный API для обновления счётчиков из app.js
  window.anim = window.anim || {};
  window.anim.updateStats = function (distributed, saved, operations) {
    const moneyFmt = (n) =>
      new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0,
      }).format(n);

    const d = $('#statDistributed');
    const s = $('#statSaved');
    const o = $('#statOperations');
    if (d) animateNumber(d, 0, distributed, 1000, moneyFmt);
    if (s) animateNumber(s, 0, saved, 1000, moneyFmt);
    if (o) animateNumber(o, 0, operations, 1000);
  };

  // =========================================================
  // 3. Плавный донат (перерисовка при новом распределении)
  // =========================================================
  function initDonutAnimation() {
    const donut = $('#donut');
    if (!donut) return;

    // Следим за изменениями stroke-dasharray через MutationObserver
    const segs = $$('.donut__seg', donut);

    segs.forEach((seg) => {
      // Стартовое состояние
      seg.style.transition = 'stroke-dasharray 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
    });

    // Появление доната при первом рендере распределения
    const resultCard = $('#resultCard');
    if (!resultCard) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === 'childList' || m.type === 'characterData') {
          // Пульсация карточки при обновлении
          resultCard.classList.remove('pulse');
          void resultCard.offsetWidth; // reflow
          resultCard.classList.add('pulse');
        }
      });
    });

    observer.observe($('#donutValue') || resultCard, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // =========================================================
  // 4. Плавная отрисовка прогресс-баров в разбивке
  // =========================================================
  function initBreakdownAnimation() {
    const breakdown = $('#breakdown');
    if (!breakdown) return;

    const observer = new MutationObserver(() => {
      const items = $$('.breakdown__item', breakdown);
      items.forEach((item, i) => {
        item.style.opacity = '0';
        item.style.transform = 'translateX(-12px)';
        setTimeout(() => {
          item.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.4,0,0.2,1)';
          item.style.opacity = '1';
          item.style.transform = 'translateX(0)';
        }, i * 80);
      });
    });

    observer.observe(breakdown, { childList: true, subtree: true });
  }

  // =========================================================
  // 5. Плавная отрисовка строк истории
  // =========================================================
  function initHistoryAnimation() {
    const tbody = $('#historyBody');
    if (!tbody) return;

    const observer = new MutationObserver(() => {
      const rows = $$('tr', tbody).filter((r) => !r.classList.contains('table__empty'));
      rows.forEach((row, i) => {
        row.style.opacity = '0';
        row.style.transform = 'translateY(8px)';
        setTimeout(() => {
          row.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
          row.style.opacity = '1';
          row.style.transform = 'translateY(0)';
        }, i * 60);
      });
    });

    observer.observe(tbody, { childList: true, subtree: true });
  }

  // =========================================================
  // 6. Пульс кнопки при нажатии (ripple-эффект)
  // =========================================================
  function initRipple() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn, .chip');
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

      // Кнопка должна быть relative + overflow hidden
      if (getComputedStyle(btn).position === 'static') {
        btn.style.position = 'relative';
      }
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    });
  }

  // =========================================================
  // 7. Плавное появление чипов быстрых сумм с задержкой
  // =========================================================
  function initChipStagger() {
    const chips = $$('#quickAmounts .chip');
    chips.forEach((chip, i) => {
      chip.style.opacity = '0';
      chip.style.transform = 'translateY(6px)';
      setTimeout(() => {
        chip.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        chip.style.opacity = '1';
        chip.style.transform = 'translateY(0)';
      }, 200 + i * 60);
    });
  }

  // =========================================================
  // 8. Живая валидация поля суммы (подсветка + shake)
  // =========================================================
  function initAmountValidation() {
    const input = $('#amount');
    const error = $('#amountError');
    if (!input || !error) return;

    let shakeTimer;
    input.addEventListener('input', () => {
      const value = Number(input.value);
      if (input.value === '') {
        error.textContent = '';
        input.classList.remove('input--error', 'input--success');
        return;
      }
      if (!value || value <= 0) {
        error.textContent = 'Сумма должна быть больше нуля';
        input.classList.add('input--error');
        input.classList.remove('input--success');
      } else if (value > 100_000_000) {
        error.textContent = 'Слишком много — не поверю :)';
        input.classList.add('input--error');
        input.classList.remove('input--success');
      } else {
        error.textContent = '';
        input.classList.remove('input--error');
        input.classList.add('input--success');
      }
    });

    input.addEventListener('blur', () => {
      if (input.classList.contains('input--error')) {
        input.classList.add('shake');
        clearTimeout(shakeTimer);
        shakeTimer = setTimeout(() => input.classList.remove('shake'), 500);
      }
    });
  }

  // =========================================================
  // 9. Плавная смена темы (без "мигания")
  // =========================================================
  function initThemeTransition() {
    const toggle = $('#themeToggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      document.documentElement.classList.add('theme-transition');
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
      }, 400);
    });
  }

  // =========================================================
  // 10. Параллакс для орбов при движении мыши
  // =========================================================
  function initOrbParallax() {
    const orbs = $$('.orb');
    if (!orbs.length) return;

    let rafId = null;
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const dx = (mouseX - cx) / cx; // -1 .. 1
        const dy = (mouseY - cy) / cy;

        orbs.forEach((orb, i) => {
          const depth = (i + 1) * 8;
          orb.style.transform = `translate(${dx * depth}px, ${dy * depth}px)`;
        });

        rafId = null;
      });
    });
  }

  // =========================================================
  // 11. Анимация логотипа при hover (небольшой bounce)
  // =========================================================
  function initLogoBounce() {
    const logo = $('.logo');
    const mark = $('.logo__mark');
    if (!logo || !mark) return;

    logo.addEventListener('mouseenter', () => {
      mark.style.transform = 'rotate(-8deg) scale(1.08)';
      mark.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    });
    logo.addEventListener('mouseleave', () => {
      mark.style.transform = 'rotate(0deg) scale(1)';
    });
  }

  // =========================================================
  // 12. Появление карточки результата (slide + fade)
  // =========================================================
  function initResultCardReveal() {
    const saveBtn = $('#saveBtn');
    const resultCard = $('#resultCard');
    if (!saveBtn || !resultCard) return;

    // Когда кнопка "Сохранить" становится активной — результат появился
    const observer = new MutationObserver(() => {
      if (!saveBtn.disabled) {
        resultCard.classList.remove('result-pop');
        void resultCard.offsetWidth;
        resultCard.classList.add('result-pop');
      }
    });
    observer.observe(saveBtn, { attributes: true, attributeFilter: ['disabled'] });
  }

  // =========================================================
  // 13. Микро-анимация строк таблицы при hover
  // =========================================================
  function initTableHover() {
    const tbody = $('#historyBody');
    if (!tbody) return;
    // Эффект реализован через CSS, тут только делегирование для мобилок
    tbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (!row || row.classList.contains('table__empty')) return;
      row.classList.add('row-tap');
      setTimeout(() => row.classList.remove('row-tap'), 350);
    });
  }

  // =========================================================
  // 14. Каскадное появление полей формы
  // =========================================================
  function initFormStagger() {
    const form = $('#calcForm');
    if (!form) return;
    const children = Array.from(form.children);
    children.forEach((child, i) => {
      child.style.opacity = '0';
      child.style.transform = 'translateY(10px)';
      setTimeout(() => {
        child.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        child.style.opacity = '1';
        child.style.transform = 'translateY(0)';
      }, 300 + i * 80);
    });
  }

  // =========================================================
  // 15. "Дыхание" активного пресета
  // =========================================================
  function initPresetBreathing() {
    const presets = $$('.preset');
    if (!presets.length) return;

    setInterval(() => {
      const checked = $$('input[name="preset"]:checked')[0];
      if (!checked) return;
      const body = checked.nextElementSibling;
      if (!body) return;
      body.classList.remove('breathe');
      void body.offsetWidth;
      body.classList.add('breathe');
    }, 4000);
  }

  // =========================================================
  // Инициализация
  // =========================================================
  function init() {
    initScrollReveal();
    initHeroCounters();
    initDonutAnimation();
    initBreakdownAnimation();
    initHistoryAnimation();
    initRipple();
    initChipStagger();
    initAmountValidation();
    initThemeTransition();
    initOrbParallax();
    initLogoBounce();
    initResultCardReveal();
    initTableHover();
    initFormStagger();
    initPresetBreathing();

    console.info('[anim] анимации подключены');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();