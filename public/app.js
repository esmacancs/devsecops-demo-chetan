'use strict';

(function () {

  // ── Helpers ────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Particle canvas ────────────────────────────────────────────
  (function initParticles() {
    const canvas = $('#particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles = [], mouse = { x: null, y: null };

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
    canvas.addEventListener('mouseleave', () => { mouse.x = null; });

    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * W;
        this.y = Math.random() * H;
        this.r = Math.random() * 2 + 0.5;
        this.dx = (Math.random() - 0.5) * 0.4;
        this.dy = (Math.random() - 0.5) * 0.4;
        this.alpha = Math.random() * 0.5 + 0.1;
        this.color = ['124,58,237', '168,85,247', '236,72,153', '6,182,212'][Math.floor(Math.random() * 4)];
      }
      update() {
        this.x += this.dx;
        this.y += this.dy;
        if (this.x < 0 || this.x > W) this.dx *= -1;
        if (this.y < 0 || this.y > H) this.dy *= -1;
        if (mouse.x !== null) {
          const ddx = this.x - mouse.x;
          const ddy = this.y - mouse.y;
          const dist = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dist < 120) {
            this.x += ddx * 0.01;
            this.y += ddy * 0.01;
          }
        }
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${this.color},${this.alpha})`;
        ctx.fill();
      }
    }

    const count = Math.min(80, Math.floor((W * H) / 15000));
    for (let i = 0; i < count; i++) particles.push(new Particle());

    function loop() {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => { p.update(); p.draw(); });
      // draw lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(124,58,237,${0.06 * (1 - dist / 140)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(loop);
    }
    loop();
  })();

  // ── Counter animation ──────────────────────────────────────────
  function animateCounters() {
    $$('.stat-num[data-count]').forEach(el => {
      const target = parseInt(el.dataset.count, 10);
      const suffix = el.closest('.stat')?.querySelector('.stat-label')?.textContent.includes('Covered') ? '%' : '';
      const duration = 1400;
      const start = performance.now();
      function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(target * ease) + suffix;
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  // ── Scroll reveal ──────────────────────────────────────────────
  function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
    }, { threshold: 0.12 });
    $$('.section, .hero').forEach(el => { el.classList.add('reveal'); observer.observe(el); });
    // Hero reveals immediately
    setTimeout(() => { const h = $('.hero'); if (h) h.classList.add('visible'); }, 100);
  }

  // ── Key toggle ─────────────────────────────────────────────────
  const apiKeyInput = $('#apiKey');
  const toggleKeyBtn = $('#toggleKey');
  if (toggleKeyBtn) {
    toggleKeyBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      toggleKeyBtn.innerHTML = isPassword
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  }

  // ── Todo API ───────────────────────────────────────────────────
  const todoList = $('#todoList');
  const todoCount = $('#todoCount');
  const todoError = $('#todosError');
  const addForm = $('#addForm');
  const newTodo = $('#newTodo');
  const apiKey = () => apiKeyInput.value.trim();

  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { error: text }; }
    if (!res.ok) {
      const err = new Error((body && body.error) || res.statusText);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function formatUptime(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return (h ? h + 'h ' : '') + (m ? m + 'm ' : '') + sec + 's';
  }

  async function loadStatus() {
    try {
      const health = await fetchJson('/health');
      $('#healthValue').textContent = health.status || 'ok';
      $('#uptimeValue').textContent = formatUptime(health.uptime || 0);
      const dot = $('#healthDot');
      if (dot) dot.innerHTML = '<span class="dot-pulse"></span>';
    } catch {
      $('#healthValue').textContent = 'offline';
      $('#uptimeValue').textContent = '—';
      const dot = $('#healthDot');
      if (dot) dot.innerHTML = '<span class="dot-pulse" style="background:var(--bad)"></span>';
    }
  }

  function renderTodos(todos) {
    todoCount.textContent = todos.length;
    todoList.innerHTML = '';
    if (!todos.length) {
      todoList.innerHTML = '<li class="todo-empty">No todos yet — add one above.</li>';
      return;
    }
    todos.forEach((todo, i) => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (todo.completed ? ' completed' : '');
      li.style.animationDelay = (i * 0.04) + 's';

      const check = document.createElement('button');
      check.className = 'todo-check' + (todo.completed ? ' checked' : '');
      check.textContent = todo.completed ? '✓' : '';
      check.title = 'Toggle completed';
      check.addEventListener('click', () => toggleTodo(todo.id, !todo.completed));

      const title = document.createElement('span');
      title.className = 'todo-title';
      title.textContent = todo.title;

      const time = document.createElement('span');
      time.className = 'todo-time';
      time.textContent = new Date(todo.createdAt).toLocaleTimeString();

      const del = document.createElement('button');
      del.className = 'todo-del';
      del.textContent = '✕';
      del.title = 'Delete';
      del.addEventListener('click', () => deleteTodo(todo.id));

      li.append(check, title, time, del);
      todoList.appendChild(li);
    });
  }

  async function loadTodos() {
    hideError();
    try {
      const todos = await fetchJson('/api/todos', { headers: { 'X-API-Key': apiKey() } });
      renderTodos(todos);
    } catch (err) {
      showError('Could not load todos: ' + (err.message || err));
    }
  }

  async function addTodo(event) {
    event.preventDefault();
    const title = newTodo.value.trim();
    if (!title) return;
    newTodo.value = '';
    hideError();
    try {
      await fetchJson('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey() },
        body: JSON.stringify({ title }),
      });
      await loadTodos();
    } catch (err) {
      showError('Could not add todo: ' + (err.message || err));
    }
  }

  async function toggleTodo(id, completed) {
    hideError();
    try {
      await fetchJson('/api/todos/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey() },
        body: JSON.stringify({ completed }),
      });
      await loadTodos();
    } catch (err) {
      showError('Could not update todo: ' + (err.message || err));
    }
  }

  async function deleteTodo(id) {
    hideError();
    try {
      await fetchJson('/api/todos/' + id, {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey() },
      });
      await loadTodos();
    } catch (err) {
      showError('Could not delete todo: ' + (err.message || err));
    }
  }

  function showError(msg) {
    todoError.textContent = msg;
    todoError.hidden = false;
  }
  function hideError() { todoError.hidden = true; }

  addForm.addEventListener('submit', addTodo);
  apiKeyInput.addEventListener('change', loadTodos);

  // ── Init ───────────────────────────────────────────────────────
  initScrollReveal();
  animateCounters();
  loadStatus();
  loadTodos();
  setInterval(loadStatus, 5000);

})();
