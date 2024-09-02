import fs from 'node:fs';
import assert from 'node:assert';
import {execFileSync} from 'node:child_process';
import {tempDirSync} from '@compilets/using-temp-dir';

import {generateCppProject, ninjaBuild} from '../src/index.ts';

// Do not include cwd in ccache hash, as tests are built in temp dirs.
process.env.CCACHE_NOHASHDIR = 'true';
// Do not check compiler time, as we are using downloaded clang.
process.env.CCACHE_COMPILERCHECK = 'none';

describe('CppProject', function() {
  this.slow(10 * 1000);
  // First time compilation can be very slow.
  this.timeout(10 * 60 * 1000);

  it('project-generation', async () => {
    using target = tempDirSync(`${__dirname}/build-`);
    const project = await generateCppProject(`${__dirname}/data-cpp-project/noop`, target.path);
    assert.deepStrictEqual(fs.readdirSync(target.path),
                           [ '.gn', 'BUILD.gn', 'cpp', 'noop.cpp', 'out' ]);
    await ninjaBuild(target.path, {config: 'Debug'});
    let exe = `${target.path}/out/Debug/noop`;
    if (process.platform == 'win32')
      exe += '.exe';
    assert.doesNotThrow(() => execFileSync(exe));
  });

  describe('executables', () => {
    // Every data-cpp-project/run-* subdir is a subtest.
    const dirs = fs.readdirSync(`${__dirname}/data-cpp-project`)
                   .filter(f => f.startsWith('run-'));
    for (const dir of dirs) {
      it(dir, () => runDir(`${__dirname}/data-cpp-project/${dir}`));
    }
  });

  describe('node-modules', () => {
    // Every data-node-module/* subdir is a subtest.
    const dirs = fs.readdirSync(`${__dirname}/data-node-module`);
    for (const dir of dirs) {
      it(dir, () => runNodeDir(`${__dirname}/data-node-module/${dir}`));
    }
  });
});

async function runDir(root: string) {
  using target = tempDirSync(`${__dirname}/build-`);
  const project = await generateCppProject(root, target.path);
  await ninjaBuild(target.path, {config: 'Debug'});
  let exe = `${target.path}/out/Debug/${project.name}`;
  if (process.platform == 'win32')
    exe += '.exe';
  assert.doesNotThrow(() => execFileSync(exe));
}

async function runNodeDir(root: string) {
  using target = tempDirSync(`${__dirname}/build-`);
  const project = await generateCppProject(root, target.path);
  await ninjaBuild(target.path, {config: 'Debug'});
  const binary = `${target.path}/out/Debug/${project.name}.node`;
  const module = {exports: {}};
  assert.doesNotThrow(() => process.dlopen(module, binary));
}
