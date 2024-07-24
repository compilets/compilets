import fs from 'node:fs';
import * as ts from 'typescript';

import {CppFile} from './cpp-file';
import {Parser} from './parser';

export interface CompileResult {
  sources: CppFile[];
};

export function compileDirectory(dir: string): CompileResult {
  const filenames = fs.readdirSync(dir).filter(f => f.endsWith('.ts'))
                                       .map(f => `${dir}/${f}`);
  const program = ts.createProgram(filenames, {
    noImplicitAny: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
  });
  const parser = new Parser(program);
  const sources: CppFile[] = [];
  for (const f of filenames) {
    const sourceFile = program.getSourceFile(f);
    sources.push(parser.parse(sourceFile!));
  }
  return {sources};
}
