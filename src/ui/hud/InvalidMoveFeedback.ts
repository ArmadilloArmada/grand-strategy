import { toastManager } from '../ToastManager';

/** Surface rejected player actions with a toast and optional context-helper flash. */
export function reportInvalidMove(
  message: string,
  options?: { toastType?: 'info' | 'error' | 'success'; flashContext?: boolean },
): void {
  toastManager.show(message, options?.toastType ?? 'info');
  if (!options?.flashContext) return;
  const helper = document.getElementById('context-helper-text');
  const container = document.getElementById('context-helper');
  if (!helper || !container) return;
  helper.textContent = message;
  container.classList.add('context-helper-warning');
  window.setTimeout(() => container.classList.remove('context-helper-warning'), 2500);
}
