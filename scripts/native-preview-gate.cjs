#!/usr/bin/env node
'use strict';
const fs = require('node:fs');

function decide(eventName, ref, sha, event) {
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Native preview requires the initiating GitHub SHA');
  const markedBranch = eventName === 'push' && ref === 'refs/heads/codex/map-first-v5'
    && event.head_commit?.id === sha && typeof event.head_commit?.message === 'string'
    && event.head_commit.message.includes('[native-preview]');
  const explicit = eventName === 'workflow_dispatch' || (eventName === 'push' && /^refs\/tags\/v[0-9]+\.[0-9]+\.[0-9]+$/.test(ref || ''));
  return { build_preview: explicit || markedBranch, source_sha: sha };
}

if (require.main === module) {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const decision = decide(process.env.GITHUB_EVENT_NAME, process.env.GITHUB_REF, process.env.GITHUB_SHA, event);
  if (!process.env.GITHUB_OUTPUT) throw new Error('Native preview gate runs as a GitHub step');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `build_preview=${decision.build_preview}\nsource_sha=${decision.source_sha}\n`);
  process.stdout.write(JSON.stringify(decision) + '\n');
}
module.exports = { decide };
