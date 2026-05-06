export function showFirstRunTutorialOffer(
  onAccept: () => void,
  onSkip: () => void
): void {
  const overlay = document.createElement('div');
  overlay.id = 'tutorial-offer-overlay';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:rgba(0,0,0,0.75)',
    'z-index:8000',
    'display:flex',
    'align-items:center',
    'justify-content:center',
  ].join(';');

  overlay.innerHTML = `
    <div style="
      background:#1a2035;border:2px solid #4a90d9;border-radius:12px;
      padding:2rem 2.5rem;max-width:420px;text-align:center;color:#e2e8f0;
      box-shadow:0 0 40px rgba(74,144,217,0.4);
    ">
      <div style="font-size:2.5rem;margin-bottom:0.75rem;">🎖️</div>
      <h2 style="margin:0 0 0.5rem;color:#60a5fa;font-size:1.4rem;">Welcome, Commander!</h2>
      <p style="margin:0 0 1.5rem;color:#94a3b8;line-height:1.5;">
        This is your first game. Would you like a quick tutorial covering
        map controls, combat, economy, and victory conditions?
      </p>
      <div style="display:flex;gap:1rem;justify-content:center;">
        <button id="tutorial-offer-yes" style="
          background:#2563eb;color:#fff;border:none;border-radius:8px;
          padding:0.6rem 1.4rem;font-size:1rem;cursor:pointer;font-weight:bold;
        ">Yes, show me!</button>
        <button id="tutorial-offer-no" style="
          background:#374151;color:#9ca3af;border:none;border-radius:8px;
          padding:0.6rem 1.4rem;font-size:1rem;cursor:pointer;
        ">Skip for now</button>
      </div>
    </div>
  `;

  const dismiss = () => overlay.remove();
  document.body.appendChild(overlay);

  document.getElementById('tutorial-offer-yes')?.addEventListener('click', () => {
    dismiss();
    onAccept();
  });
  document.getElementById('tutorial-offer-no')?.addEventListener('click', () => {
    dismiss();
    onSkip();
  });
}
