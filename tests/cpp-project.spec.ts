import assert from 'node:assert';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe, it} from 'node:test';
import {tempDirSync} from '@compilets/using-temp-dir';

import {compileDirectory} from '../src/index.ts';

// We are building tests in temporary directories, without setting this env
// ccache will not hit cache as it would include cwd in the hash.
process.env.CCACHE_NOHASHDIR = 'true';

describe('CppProject', () => {
  it('generation', async () => {
    const project = compileDirectory(`${__dirname}/data-cpp-project/noop`);
    using target = tempDirSync();
    await project.writeTo(target.path, {generationMode: 'exe'});
    assert.deepStrictEqual(fs.readdirSync(target.path),
                           [ '.gn', 'BUILD.gn', 'cppgc', 'noop.cpp' ]);
    await project.gnGen(target.path, {config: 'Debug'});
    assert.ok(fs.statSync(`${target.path}/out`).isDirectory());
    await project.ninjaBuild(target.path, {config: 'Debug'});
    let exe = `${target.path}/out/Debug/noop`;
    if (process.platform == 'win32')
      exe += '.exe';
    assert.doesNotThrow(() => execFileSync(exe));
  });
});
