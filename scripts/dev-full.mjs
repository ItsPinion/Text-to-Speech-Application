#!/usr/bin/env node
/**
 * `pnpm dev:full` — ONE command for the whole local stack:
 *
 *   1. starts the IndexTTS sidecar (docker compose up -d indextts)
 *   2. waits until it answers /health (first boot downloads ~2-4 GB of
 *      model weights — this script waits patiently and says so)
 *   3. starts UI + API with TTS_PROVIDER=indextts already wired
 *   4. on exit (Ctrl+C), stops the sidecar again (models stay cached
 *      in the docker volume — next boot is instant)
 *
 * Requires Docker. No Docker / just want to hack on the UI? → `pnpm dev`.
 */
import { spawn, spawnSync } from 'node:child_process';

const SIDECAR_URL = (
  process.env.INDEX_TTS_API_URL ?? 'http://127.0.0.1:7861'
).replace(/\/+$/, '');
const BOOT_TIMEOUT_MS = Number.parseInt(
  process.env.INDEX_TTS_BOOT_TIMEOUT_MS ?? '900000',
  10,
); // 15 min default — model download on first boot is the slow part
const POLL_MS = 2000;

const log = (message) => console.log(`[dev:full] ${message}`);

function dockerAvailable() {
  const probe = spawnSync('docker', ['info', '--format', 'ok'], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSidecar() {
  const startedAt = Date.now();
  let announcedSlowBoot = false;

  while (Date.now() - startedAt < BOOT_TIMEOUT_MS) {
    try {
      const response = await fetch(`${SIDECAR_URL}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) {
        const body = await response.json().catch(() => ({}));
        log(`sidecar is up on ${SIDECAR_URL} (device: ${body.device ?? '?'})`);
        return true;
      }
    } catch {
      // Not up yet — keep waiting.
    }

    const waited = Math.round((Date.now() - startedAt) / 1000);
    if (!announcedSlowBoot && waited > 20) {
      announcedSlowBoot = true;
      log(
        'still waiting… FIRST BOOT downloads ~2-4 GB of model weights into the ' +
          'docker volume (this happens only once). Watch progress with: docker compose logs -f indextts',
      );
    }
    await sleep(POLL_MS);
  }
  return false;
}

async function main() {
  if (!dockerAvailable()) {
    console.error(
      '[dev:full] Docker is not available.\n' +
        '  • Install Docker Desktop / Engine, or\n' +
        '  • run the plain dev loop without real speech:  pnpm dev\n' +
        '  • manual sidecar setup (no docker):  see sidecar/README.md',
    );
    process.exit(1);
  }

  log('starting IndexTTS sidecar (docker compose up -d indextts)…');
  const up = spawnSync('docker', ['compose', 'up', '-d', 'indextts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (up.status !== 0) {
    console.error('[dev:full] docker compose failed — is the docker daemon running?');
    process.exit(up.status ?? 1);
  }

  log(`waiting for the sidecar at ${SIDECAR_URL}/health…`);
  const healthy = await waitForSidecar();
  if (!healthy) {
    log(
      `WARNING: sidecar not healthy after ${Math.round(BOOT_TIMEOUT_MS / 1000)}s — ` +
        'starting the apps anyway. Synthesis will return "unavailable" until the ' +
        'sidecar finishes preparing; the rest of the app works.',
    );
  }

  log('starting UI + API with TTS_PROVIDER=indextts…  (Ctrl+C stops everything)');
  const child = spawn('pnpm', ['dev'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      TTS_PROVIDER: 'indextts',
      INDEX_TTS_API_URL: SIDECAR_URL,
    },
  });

  let stopped = false;
  const stopSidecar = () => {
    if (stopped) return;
    stopped = true;
    log('stopping the sidecar (models stay cached in the docker volume)…');
    spawnSync('docker', ['compose', 'stop', 'indextts'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  };

  child.on('exit', (code) => {
    stopSidecar();
    process.exit(code ?? 0);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }
}

main().catch((error) => {
  console.error('[dev:full] unexpected failure:', error);
  process.exit(1);
});
