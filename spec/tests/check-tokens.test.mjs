import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jaryo-token-check-'));
try {
  for (const dir of ['reference', 'adaptor']) fs.mkdirSync(path.join(root, dir));
  for (const dir of ['reference', 'adaptor']) fs.cpSync(new URL(`../${dir}`, import.meta.url), path.join(root, dir), { recursive: true });
  const checker = new URL('../pipeline/check-tokens.mjs', import.meta.url).pathname;
  const run = () => spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  let result = run(); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((result.stdout.match(/^PASS /gm) || []).length, 6);
  for (const [file, value] of [['reference/hero.html', '#333333'], ['reference/adaptor-view.html', '#101010'], ['adaptor/view-template.html', 'hsl(0 100% 50%)'], ['reference/index.html', 'red'], ['reference/adaptor-view-failed-example.html', 'hwb(0 0% 0%)']]) {
    const target = path.join(root, file), original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, original + `<p style="color:${value}">sample</p>`);
    result = run(); assert.equal(result.status, 1, `${file} ${value}: ${result.stdout}`);
    fs.writeFileSync(target, original);
  }
  // Hex colors outside <style> blocks and quoted style attributes must still fail.
  for (const [file, markup] of [['reference/hero.html', '<svg><rect fill="#ff0000"/></svg>'], ['reference/index.html', '<script>document.body.style.color="#ff0000"</script>'], ['reference/hero.html', '<p style=color:#ff0000>x</p>']]) {
    const target = path.join(root, file), original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, original + markup);
    result = run(); assert.equal(result.status, 1, `${file} ${markup}: ${result.stdout}`);
    assert.match(result.stdout, /not in tokens: ff0000/);
    fs.writeFileSync(target, original);
  }
  // Color functions outside <style> blocks and quoted style attributes must still fail.
  for (const [file, markup] of [['reference/hero.html', '<svg><rect fill="rgb(255,0,0)"/></svg>'], ['reference/index.html', '<script>document.body.style.color="rgba(255,0,0,.5)"</script>'], ['reference/hero.html', '<p style=color:rgb(1,2,3)>x</p>']]) {
    const target = path.join(root, file), original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, original + markup);
    result = run(); assert.equal(result.status, 1, `${file} ${markup}: ${result.stdout}`);
    assert.match(result.stdout, /color functions: /);
    fs.writeFileSync(target, original);
  }
  const target = path.join(root, 'reference/hero.html');
  const originalHero = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(target, '<style>p{margin:0}</style><p style="color:red">test</p>');
  result = run(); assert.equal(result.status, 1, 'isolated inline named color must fail');
  fs.writeFileSync(target, originalHero);
  fs.appendFileSync(target, '\n<p>&#333333;</p>');
  result = run(); assert.equal(result.status, 0, result.stdout + result.stderr);
  console.log('PASS spec token scanner regressions');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
