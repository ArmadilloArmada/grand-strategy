/**

 * Electron desktop smoke — verifies packaged or built artifacts reach main menu.

 * CI: runs structural checks when unpacked exe is not present.

 * Local: after `npm run pack`, launches win-unpacked and checks #main-menu-modal via CDP.

 */



const fs = require('fs');

const path = require('path');

const http = require('http');

const { spawn } = require('child_process');



const root = path.resolve(__dirname, '..');

const distIndex = path.join(root, 'dist', 'index.html');

const unpackedDir = path.join(root, 'release', 'win-unpacked');

const exeCandidates = [

  path.join(unpackedDir, 'Grand Strategy.exe'),

  path.join(unpackedDir, 'grand-strategy.exe'),

];

const DEBUG_PORT = 19229;

const SMOKE_MS = 20_000;



function fail(message) {

  console.error(`[smoke:electron] FAILED: ${message}`);

  process.exit(1);

}



function structuralCheck() {

  if (!fs.existsSync(path.join(root, 'electron', 'main.cjs'))) {

    fail('electron/main.cjs missing');

  }

  if (!fs.existsSync(distIndex)) {

    fail('dist/index.html missing — run npm run build first');

  }

  console.log('[smoke:electron] Structural check OK (dist + electron main)');

}



function findExe() {

  return exeCandidates.find(p => fs.existsSync(p)) ?? null;

}



function fetchJson(url) {

  return new Promise((resolve, reject) => {

    http.get(url, res => {

      let body = '';

      res.on('data', chunk => { body += chunk; });

      res.on('end', () => {

        try {

          resolve(JSON.parse(body));

        } catch (err) {

          reject(err);

        }

      });

    }).on('error', reject);

  });

}



async function waitFor(predicate, timeoutMs, label) {

  const start = Date.now();

  let lastErr = null;

  while (Date.now() - start < timeoutMs) {

    try {

      const value = await predicate();

      if (value) return value;

    } catch (err) {

      lastErr = err;

    }

    await new Promise(r => setTimeout(r, 400));

  }

  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'timeout');

  fail(`${label}: ${detail}`);

}



async function cdpEvaluate(wsUrl, expression) {

  const WebSocket = await import('ws').then(m => m.default ?? m);

  return new Promise((resolve, reject) => {

    const ws = new WebSocket(wsUrl);

    let id = 0;

    const pending = new Map();



    ws.on('open', () => {

      const send = (method, params = {}) => {

        id += 1;

        const msgId = id;

        return new Promise((res, rej) => {

          pending.set(msgId, { res, rej });

          ws.send(JSON.stringify({ id: msgId, method, params }));

        });

      };



      (async () => {

        try {

          await send('Runtime.enable');

          const result = await send('Runtime.evaluate', {

            expression,

            returnByValue: true,

            awaitPromise: true,

          });

          ws.close();

          if (result.exceptionDetails) {

            reject(new Error(result.exceptionDetails.text ?? 'CDP evaluate failed'));

            return;

          }

          resolve(result.result?.value);

        } catch (err) {

          ws.close();

          reject(err);

        }

      })();

    });



    ws.on('message', raw => {

      let msg;

      try {

        msg = JSON.parse(String(raw));

      } catch {

        return;

      }

      if (msg.id != null && pending.has(msg.id)) {

        const { res, rej } = pending.get(msg.id);

        pending.delete(msg.id);

        if (msg.error) rej(new Error(msg.error.message ?? JSON.stringify(msg.error)));

        else res(msg.result);

      }

    });



    ws.on('error', reject);

    setTimeout(() => {

      ws.close();

      reject(new Error('CDP evaluate timed out'));

    }, 10_000);

  });

}



async function launchAndVerifyMainMenu(exePath) {

  console.log(`[smoke:electron] Launching ${exePath} (CDP main-menu check)...`);

  const child = spawn(exePath, [`--remote-debugging-port=${DEBUG_PORT}`], {

    cwd: path.dirname(exePath),

    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },

    stdio: 'ignore',

  });



  let killed = false;

  const killChild = () => {

    if (killed) return;

    killed = true;

    try { child.kill(); } catch { /* ignore */ }

  };



  child.on('error', err => {

    killChild();

    fail(err.message);

  });



  try {

    const targets = await waitFor(async () => {

      const list = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json`);

      if (!Array.isArray(list)) return null;

      return list.find(t => t.type === 'page' && t.webSocketDebuggerUrl) ?? null;

    }, SMOKE_MS, 'Electron CDP page target not found');



    const visible = await waitFor(async () => {

      const value = await cdpEvaluate(

        targets.webSocketDebuggerUrl,

        `(() => {

          const el = document.getElementById('main-menu-modal');

          if (!el) return false;

          return !el.classList.contains('hidden') && el.getClientRects().length > 0;

        })()`,

      );

      return value === true ? true : null;

    }, SMOKE_MS, 'Main menu (#main-menu-modal) never became visible');



    if (!visible) fail('Main menu check returned false');

    console.log('[smoke:electron] Launch smoke OK — main menu visible');

  } finally {

    killChild();

  }

}



async function main() {

  const exe = findExe();

  if (exe) {

    await launchAndVerifyMainMenu(exe);

    return;

  }



  structuralCheck();

  console.log('[smoke:electron] No win-unpacked exe — structural only. Run npm run pack for launch smoke.');

}



main().catch(err => fail(err instanceof Error ? err.message : String(err)));


