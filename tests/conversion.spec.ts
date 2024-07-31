import fs from 'node:fs';
import assert from 'node:assert';
import {describe, it} from 'node:test';

import CppProject from '../src/cpp-project.ts';
import Parser from '../src/parser.ts';

describe('Conversion', () => {
  // Every subdir under data-conversion/ is a subtest.
  const dirs = fs.readdirSync(`${__dirname}/data-conversion`);
  for (const dir of dirs) {
    it(dir, () => testDir(`${__dirname}/data-conversion/${dir}`));
  }
});

function testDir(root) {
  // Parse the TypeScript files.
  const project = new CppProject(root);
  const parser = new Parser(project);
  parser.parse();
  // Compare the compiled results with the .h/.cpp files in dir.
  const entries = Array.from(project.files.entries());
  const result = entries.map(([n, f]) => [n, f.print({mode: 'lib'})]);
  const expected = fs.readdirSync(root)
                     .filter(f => f.endsWith('.h') || f.endsWith('.cpp'))
                     .map(f => [ f, fs.readFileSync(`${root}/${f}`).toString() ]);
  assert.deepStrictEqual(result, expected);
}
