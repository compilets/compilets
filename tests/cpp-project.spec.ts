import assert from 'node:assert';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe, it} from 'node:test';
import {tempDirSync} from '@compilets/using-temp-dir';

import {compileDirectory} from '../src/index.ts';

describe('CppProject', () => {
  it('generation', async () => {
    const project = compileDirectory(`${__dirname}/data-cpp-project/noop`);
    using target = tempDirSync();
    await project.writeTo(target.path, {generationMode: 'exe'});
    assert.deepStrictEqual(fs.readdirSync(target.path),
                           [ '.gn', 'BUILD.gn', 'noop.cpp' ]);
    await project.gnGen(target.path);
    assert.ok(fs.statSync(`${target.path}/out`).isDirectory());
    await project.ninjaBuild(target.path);
    let exe = `${target.path}/out/noop`;
    if (process.platform == 'win32')
      exe += '.exe';
    assert.doesNotThrow(() => execFileSync(exe));
  });
});
