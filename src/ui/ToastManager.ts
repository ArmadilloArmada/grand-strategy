/**
 * ToastManager - standalone notification toast system.
 * Singleton so any module can show toasts without holding a HUD reference.
 */

type ToastType = 'info' | 'success' | 'error';

class ToastManager {
  show(message: string, type: ToastType = 'info'): void {
    const container = document.getElementById('toast-container');
    if (!container) return;

    while (container.children.length >= 3) {
      (container.children[0] as HTMLElement).remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    const duration = type === 'info' ? 1800 : 3000;
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

export const toastManager = new ToastManager();
