'use strict';

(function () {
  const $ = (sel) => document.querySelector(sel);

  const apiKeyInput = $('#apiKey');
  const todoList = $('#todoList');
  const todoCount = $('#todoCount');
  const todoError = $('#todoError');
  const addForm = $('#addForm');
  const newTodo = $('#newTodo');

  const apiKey = () => apiKeyInput.value.trim();

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { error: text };
    }
    if (!res.ok) {
      const err = new Error((body && body.error) || res.statusText);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function setStatus(id, text, state) {
    const el = $(id);
    el.textContent = text;
    const dot = $('#apiStatusDot');
    if (dot) dot.className = 'dot ' + (state || 'wait');
  }

  async function loadStatus() {
    try {
      const health = await fetchJson('/health');
      $('#healthValue').textContent = health.status || 'unknown';
      $('#uptimeValue').textContent = formatUptime(health.uptime || 0);
      setStatus('#apiStatus', 'online', 'ok');
    } catch {
      setStatus('#apiStatus', 'offline', 'bad');
      $('#healthValue').textContent = '—';
    }
  }

  function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (h) parts.push(h + 'h');
    if (m) parts.push(m + 'm');
    parts.push(s + 's');
    return parts.join(' ');
  }

  function renderTodos(todos) {
    todoCount.textContent = todos.length;
    todoList.innerHTML = '';
    if (!todos.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No todos yet — add one above.';
      todoList.appendChild(li);
      return;
    }
    todos.forEach((todo) => {
      const li = document.createElement('li');
      if (todo.completed) li.classList.add('completed');

      const check = document.createElement('button');
      check.className = 'check' + (todo.completed ? ' checked' : '');
      check.textContent = todo.completed ? '✓' : '';
      check.title = 'Toggle completed';
      check.setAttribute('aria-label', 'Toggle completed');
      check.addEventListener('click', () => toggleTodo(todo.id, !todo.completed));

      const title = document.createElement('span');
      title.className = 'todo-title';
      title.textContent = todo.title;

      const created = document.createElement('span');
      created.className = 'todo-created';
      created.textContent = new Date(todo.createdAt).toLocaleString();

      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '✕';
      del.title = 'Delete';
      del.setAttribute('aria-label', 'Delete todo');
      del.addEventListener('click', () => deleteTodo(todo.id));

      li.append(check, title, created, del);
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
    hideError();
    try {
      await fetchJson('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey() },
        body: JSON.stringify({ title }),
      });
      newTodo.value = '';
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
  function hideError() {
    todoError.hidden = true;
  }

  addForm.addEventListener('submit', addTodo);
  apiKeyInput.addEventListener('change', loadTodos);

  loadStatus();
  loadTodos();
  setInterval(loadStatus, 5000);
})();
