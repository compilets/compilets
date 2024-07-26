import fs from 'node:fs';
import * as ts from 'typescript';

import CppFile from './cpp-file';
import CppProject from './cpp-project';
import Parser from './parser';

export function compileDirectory(dir: string): CppProject {
  const filenames = fs.readdirSync(dir).filter(f => f.endsWith('.ts'))
                                       .map(f => `${dir}/${f}`);
  const program = ts.createProgram(filenames, {
    noImplicitAny: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
  });
  const parser = new Parser(dir, program);
  return parser.parse();
}
