import fs from 'node:fs';
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {compileDirectory} from '../src/index.ts';

describe('Conversion', () => {
  // Every subdir under data-conversion/ is a subtest.
  const dirs = fs.readdirSync(`${__dirname}/data-conversion`);
  for (const dir of dirs) {
    it(dir, () => testDir(`${__dirname}/data-conversion/${dir}`));
  }
});

function testDir(dir) {
  // Compare the compiled results with the .h/.cpp files in dir.
  const entries = Array.from(compileDirectory(dir).files.entries());
  const result = entries.map(([n, f]) => [n, f.print({mode: 'lib'})]);
  const expected = fs.readdirSync(dir)
                     .filter(f => f.endsWith('.h') || f.endsWith('.cpp'))
                     .map(f => [ f, fs.readFileSync(`${dir}/${f}`).toString() ]);
  assert.deepStrictEqual(result, expected);
}
