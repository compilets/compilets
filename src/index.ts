import fs from 'node:fs';
import * as ts from 'typescript';

import CppFile from './cpp-file';
import CppProject from './cpp-project';
import Parser from './parser';

export function compileDirectory(rootDir: string, mainFileName?: string): CppProject {
  const fileNames = fs.readdirSync(rootDir).filter(f => f.endsWith('.ts'))
                                           .map(f => `${rootDir}/${f}`);
  if (fileNames.length == 0)
    throw new Error(`Directory "${rootDir}" contains no TypeScript file`);
  if (fileNames.length > 1 && !mainFileName)
    throw new Error('Must specify the entry file when compiling multiple files');
  if (!mainFileName)
    mainFileName = fileNames[0];
  const program = ts.createProgram(fileNames, {
    rootDir,
    noImplicitAny: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
  });
  const parser = new Parser(rootDir, mainFileName, program);
  return parser.parse();
}
