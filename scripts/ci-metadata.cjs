const fs = require('node:fs');
const path = require('node:path');

function metadata(env, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a numeric major.minor.patch package version.');
  const run = Number(env.GITHUB_RUN_NUMBER);
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  if (!Number.isInteger(run) || run < 1 || run > 9999 || !Number.isInteger(attempt) || attempt < 1 || attempt > 99) {
    throw new Error('CI run must be 1–9999 and attempt 1–99; revise numbering explicitly before this limit.');
  }
  const tag = env.GITHUB_REF_TYPE === 'tag';
  if (tag && env.GITHUB_REF_NAME !== `v${version}`) throw new Error('The version tag must exactly match package.json.');
  return {
    version,
    build_number: `${run}.${attempt}.0`,
    variants: JSON.stringify(tag ? ['release'] : ['release', 'development']),
  };
}

if (require.main === module) {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../ExpoRideSpeed/package.json'), 'utf8'));
  const values = metadata(process.env, pkg.version);
  const text = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, text);
  process.stdout.write(text);
}
module.exports = { metadata };
