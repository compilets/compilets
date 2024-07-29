import assert from 'node:assert';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe, it} from 'node:test';
import {tempDirSync} from '@compilets/using-temp-dir';

import {compileDirectory} from '../src/index.ts';

// Do not include cwd in ccache hash, as tests are built in temp dirs.
process.env.CCACHE_NOHASHDIR = 'true';
// Do not check compiler time, as we are using downloaded clang.
process.env.CCACHE_COMPILERCHECK = 'none';

describe('CppProject', () => {
  it('simple-generation', async () => {
    const project = compileDirectory(`${__dirname}/data-cpp-project/noop`);
    using target = tempDirSync(`${__dirname}/build-`);
    await project.writeTo(target.path, {generationMode: 'exe'});
    assert.deepStrictEqual(fs.readdirSync(target.path),
                           [ '.gn', 'BUILD.gn', 'cpp', 'noop.cpp' ]);
    await project.gnGen(target.path, {config: 'Debug'});
    assert.ok(fs.statSync(`${target.path}/out`).isDirectory());
    await project.ninjaBuild(target.path, {config: 'Debug'});
    let exe = `${target.path}/out/Debug/noop`;
    if (process.platform == 'win32')
      exe += '.exe';
    assert.doesNotThrow(() => execFileSync(exe));
  });

  describe('build-and-run', () => {
    // Every data-cpp-project/run-* subdir is a subtest.
    const dirs = fs.readdirSync(`${__dirname}/data-cpp-project`)
                   .filter(f => f.startsWith('run-'));
    for (const dir of dirs) {
      it(dir, () => runDir(`${__dirname}/data-cpp-project/${dir}`));
    }
  });
});

async function runDir(dir) {
  const project = compileDirectory(dir);
  using target = tempDirSync(`${__dirname}/build-`);
  await project.writeTo(target.path, {generationMode: 'exe'});
  await project.gnGen(target.path, {config: 'Debug'});
  await project.ninjaBuild(target.path, {config: 'Debug'});
  let exe = `${target.path}/out/Debug/${project.name}`;
  if (process.platform == 'win32')
    exe += '.exe';
  assert.doesNotThrow(() => execFileSync(exe));
}
