/**
 * Static HTML for the credits overlay. Extracted from main so the (large,
 * static) markup lives outside the Game god-class. The caller creates the
 * overlay element and wires the close button.
 */
export function buildCreditsHtml(): string {
  return `
      <div style="
        background:#0f172a;border:1px solid #334155;border-radius:14px;
        padding:2.5rem 3rem;max-width:540px;width:90%;color:#e2e8f0;
        max-height:80vh;overflow-y:auto;box-shadow:0 0 60px rgba(0,0,0,0.8);
      ">
        <div style="text-align:center;margin-bottom:2rem;">
          <div style="font-size:2.5rem;">🌍</div>
          <h2 style="margin:0.5rem 0 0.25rem;color:#60a5fa;font-size:1.6rem;letter-spacing:0.05em;">
            GRAND STRATEGY
          </h2>
          <p style="margin:0;color:#64748b;font-size:0.9rem;">Version 1.0.0</p>
        </div>

        <section style="margin-bottom:1.5rem;">
          <h3 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 0.75rem;">
            Development
          </h3>
          <p style="margin:0 0 0.4rem;font-weight:bold;">ArmadilloArmada</p>
          <p style="margin:0;color:#64748b;font-size:0.9rem;">Game design, programming, art</p>
        </section>

        <section style="margin-bottom:1.5rem;">
          <h3 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 0.75rem;">
            Built With
          </h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;font-size:0.9rem;color:#94a3b8;">
            <span>⚡ Electron</span><span>🛠️ Vite</span>
            <span>🔷 TypeScript</span><span>🎮 steamworks.js</span>
            <span>🧪 Vitest</span><span>🎨 HTML5 Canvas</span>
          </div>
        </section>

        <section style="margin-bottom:1.5rem;">
          <h3 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 0.75rem;">
            Inspired By
          </h3>
          <p style="margin:0;color:#94a3b8;font-size:0.9rem;">
            TripleA · Axis &amp; Allies · Hearts of Iron
          </p>
        </section>

        <section style="margin-bottom:2rem;">
          <h3 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 0.75rem;">
            Open Source Licenses
          </h3>
          <p style="margin:0;color:#64748b;font-size:0.85rem;line-height:1.6;">
            This game uses open-source software. All third-party libraries
            are used under their respective licenses (MIT, Apache 2.0, BSD).
            Full license text is included in the installation directory
            under <code style="color:#94a3b8;">licenses/</code>.
          </p>
        </section>

        <div style="text-align:center;">
          <button id="btn-close-credits" style="
            background:#1e3a5f;color:#60a5fa;border:1px solid #2563eb;
            border-radius:8px;padding:0.5rem 2rem;font-size:1rem;cursor:pointer;
          ">Close</button>
        </div>
      </div>
    `;
}
