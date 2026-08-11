'use strict';

let todos = [];
let nextId = 1;

function list() {
  return todos;
}

function get(id) {
  return todos.find((t) => t.id === id);
}

function create({ title, completed }) {
  const todo = {
    id: nextId,
    title,
    completed: Boolean(completed),
    createdAt: new Date().toISOString(),
  };
  nextId += 1;
  todos.push(todo);
  return todo;
}

function update(id, patch) {
  const index = todos.findIndex((t) => t.id === id);
  if (index === -1) {
    return null;
  }
  todos[index] = { ...todos[index], ...patch };
  return todos[index];
}

function remove(id) {
  const index = todos.findIndex((t) => t.id === id);
  if (index === -1) {
    return false;
  }
  todos.splice(index, 1);
  return true;
}

function clear() {
  todos = [];
  nextId = 1;
}

module.exports = { list, get, create, update, remove, clear };
