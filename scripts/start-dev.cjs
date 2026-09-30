const { spawn } = require('node:child_process');
const path = require('node:path');
const project = path.resolve(__dirname, '../ExpoRideSpeed');
const child = spawn(process.execPath, [
  path.join(project, 'node_modules/expo/bin/cli'),
  'start', '--dev-client', '--lan', ...process.argv.slice(2),
], {
  cwd: project,
  env: { ...process.env, APP_VARIANT: 'development' },
  stdio: 'inherit',
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
