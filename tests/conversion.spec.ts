import fs from 'node:fs';
import assert from 'node:assert';

import {CppProject, Parser} from '../src/index.ts';

describe('Conversion', function() {
  this.slow(2000);
  this.timeout(5 * 1000);

  // Every subdir under data-conversion/ is a subtest.
  const dirs = fs.readdirSync(`${__dirname}/data-conversion`);
  for (const dir of dirs) {
    it(dir, () => testDir(`${__dirname}/data-conversion/${dir}`));
  }
});

function testDir(root: string) {
  const project = new CppProject(root);
  // Parse the TypeScript files.
  const parser = new Parser(project);
  parser.parse();
  // Compare the compiled results with the .h/.cpp files in dir.
  const result = Array.from(project.getPrintedFiles()).sort();
  const expected = fs.readdirSync(root)
                     .filter(f => f.endsWith('.h') || f.endsWith('.cpp'))
                     .map(f => [ f, fs.readFileSync(`${root}/${f}`).toString() ]);
  assert.deepStrictEqual(result, expected);
}
