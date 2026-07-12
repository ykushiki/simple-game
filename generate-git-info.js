const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = __dirname;
const outputPath = path.join(repoRoot, 'src', 'git-info.json');

function runGit(command) {
  return execSync(command, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

try {
  const commit = runGit('git rev-parse --short HEAD');
  const date = runGit('git log -1 --format=%cs');
  const content = JSON.stringify({ commit, date }, null, 2) + '\n';
  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(`Generated ${path.relative(repoRoot, outputPath)} -> ${commit} (${date})`);
} catch (error) {
  console.error('Failed to generate git-info.json:', error.message);
  process.exitCode = 1;
}
