import assert from 'node:assert';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe, it} from 'node:test';
import {tempDirSync} from '@compilets/using-temp-dir';

import {generateCppProject} from '../src/index.ts';

// Do not include cwd in ccache hash, as tests are built in temp dirs.
process.env.CCACHE_NOHASHDIR = 'true';
// Do not check compiler time, as we are using downloaded clang.
process.env.CCACHE_COMPILERCHECK = 'none';

describe('CppProject', () => {
  it('simple-generation', async () => {
    using target = tempDirSync(`${__dirname}/build-`);
    const project = await generateCppProject(`${__dirname}/data-cpp-project/noop`, target.path);
    assert.deepStrictEqual(fs.readdirSync(target.path),
                           [ '.gn', 'BUILD.gn', 'cpp', 'noop.cpp', 'out' ]);
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

async function runDir(root) {
  using target = tempDirSync(`${__dirname}/build-`);
  const project = await generateCppProject(root, target.path);
  await project.ninjaBuild(target.path, {config: 'Debug'});
  let exe = `${target.path}/out/Debug/${project.name}`;
  if (process.platform == 'win32')
    exe += '.exe';
  assert.doesNotThrow(() => execFileSync(exe));
}
