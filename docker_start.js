/**
 * DevOps Deploy Agent — Docker Startup Helper
 * Waits for Docker daemon, then builds and starts the full stack.
 * Run: node docker_start.js
 */
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CWD = __dirname;
const LOG = path.join(CWD, 'docker_start.log');
const log = fs.createWriteStream(LOG, { flags: 'w' });

function write(msg) {
  process.stdout.write(msg + '\n');
  log.write(msg + '\n');
}

function run(cmd, args, opts = {}) {
  write(`\n  $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: CWD,
    stdio: 'inherit',
    shell: true,
    ...opts
  });
  return result;
}

function dockerReady() {
  const r = spawnSync('docker', ['info'], { cwd: CWD, shell: true, stdio: 'pipe' });
  return r.status === 0;
}

function waitForDocker(maxWait = 120) {
  write('\n⏳ Waiting for Docker daemon to be ready...');
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxWait) {
    if (dockerReady()) {
      write('✅ Docker is ready!\n');
      return true;
    }
    write(`   Still waiting... (${Math.round((Date.now() - start) / 1000)}s)`);
    // Sleep 5s
    spawnSync('cmd', ['/c', 'timeout /t 5 /nobreak > nul'], { shell: false });
  }
  write('❌ Docker did not start within ' + maxWait + 's');
  return false;
}

write('='.repeat(60));
write('  DevOps Deploy Agent — Docker Production Build');
write('='.repeat(60));

// 1. Wait for Docker
if (!waitForDocker(180)) {
  write('\n💡 Please start Docker Desktop manually, then re-run this script.');
  process.exit(1);
}

// 2. Build images
write('\n[1/3] Building Docker images (may take 3-5 min)...');
const build = run('docker', ['compose', 'build', '--no-cache']);
if (build.status !== 0) {
  write('❌ Build failed! Check output above.');
  process.exit(1);
}
write('✅ Images built successfully!');

// 3. Start stack
write('\n[2/3] Starting the stack...');
const up = run('docker', ['compose', 'up', '-d']);
if (up.status !== 0) {
  write('❌ Failed to start stack!');
  process.exit(1);
}
write('✅ Stack started!');

// 4. Show status
write('\n[3/3] Checking service status...');
run('docker', ['compose', 'ps']);

write('\n' + '='.repeat(60));
write('  🎉 Production Stack Running!');
write('='.repeat(60));
write(`
  📱 App:      http://localhost
  🔧 n8n UI:   http://localhost/n8n
  🔗 Webhook:  http://localhost/webhook/deploy
  📊 Health:   http://localhost/health

  Next step — create the n8n workflow:
    python scripts/create_n8n_workflow.py

  Or run the full setup:
    python scripts/setup_production.py

  Logs:
    docker compose logs -f
`);

log.end();
