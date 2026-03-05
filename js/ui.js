/**
 * ui.js — Shared UI helper functions
 * Manages state transitions, notifications, and inline errors.
 */

'use strict';

// ─── Toast Notifications ────────────────────────────────────────────────────

/**
 * Creates (or reuses) the toast container element.
 * @returns {HTMLElement}
 */
function getToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Shows a toast notification.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'warning'|'info'} [type='info'] - Toast type.
 * @param {number} [duration=3500] - Auto-dismiss delay in milliseconds.
 */
function showNotification(message, type = 'info', duration = 3500) {
  const container = getToastContainer();

  const iconMap = {
    success: '<i data-lucide="check-circle" style="width:18px;height:18px;color:var(--success)"></i>',
    error:   '<i data-lucide="x-circle"     style="width:18px;height:18px;color:var(--error)"></i>',
    warning: '<i data-lucide="alert-triangle" style="width:18px;height:18px;color:var(--warning)"></i>',
    info:    '<i data-lucide="info"          style="width:18px;height:18px;color:var(--accent)"></i>',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${iconMap[type] || iconMap.info}<span>${_escapeHtml(message)}</span>`;
  container.appendChild(toast);

  // Re-render Lucide icons inside the new toast
  if (window.lucide) {
    lucide.createIcons({ nodes: [toast] });
  }

  const dismiss = () => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  const timer = setTimeout(dismiss, duration);
  toast.addEventListener('click', () => { clearTimeout(timer); dismiss(); });
}

// ─── State Management ────────────────────────────────────────────────────────

/**
 * Switches the active page state.
 * All elements with class `state-view` are hidden; the one with
 * id `state-${stateName}` (or data-state="${stateName}") is shown.
 *
 * @param {'upload'|'processing'|'results'} stateName
 */
function showState(stateName) {
  document.querySelectorAll('.state-view').forEach(el => {
    el.classList.remove('active');
  });

  const target = document.querySelector(`[data-state="${stateName}"]`);
  if (target) {
    target.classList.add('active');
  }
}

// ─── Inline Errors ───────────────────────────────────────────────────────────

/**
 * Shows an inline error message inside the upload zone.
 * @param {string} message
 */
function showError(message) {
  const el = document.getElementById('upload-error');
  if (!el) return;
  el.querySelector('.error-text').textContent = message;
  el.classList.add('visible');

  const dropZone = document.getElementById('drop-zone');
  if (dropZone) {
    dropZone.classList.add('has-error');
    dropZone.classList.remove('has-file');
  }
}

/**
 * Clears the inline error message.
 */
function clearError() {
  const el = document.getElementById('upload-error');
  if (el) el.classList.remove('visible');

  const dropZone = document.getElementById('drop-zone');
  if (dropZone) dropZone.classList.remove('has-error');
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Escapes HTML special characters in a string.
 * @param {string} str
 * @returns {string}
 */
function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ─── Export ──────────────────────────────────────────────────────────────────

// Make functions available globally (no module system)
window.UI = {
  showState,
  showNotification,
  showError,
  clearError,
};
