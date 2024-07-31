import CppFile from './cpp-file';
import CppProject from './cpp-project';
import Parser from './parser';
import {gnGen} from './gn-utils';

export {CppFile, CppProject, Parser};
export * from './gn-utils';

interface GenerateCppProjectOptions {
  stream?: boolean;
}

/**
 * Create a project from `root`, parser it and generate build files to `target`.
 */
export async function generateCppProject(root: string,
                                         target: string,
                                         options?: GenerateCppProjectOptions): Promise<CppProject> {
  const project = new CppProject(root);
  const parser = new Parser(project);
  parser.parse();
  await project.writeTo(target, {generationMode: 'exe'});
  await gnGen(target, {config: 'Debug', stream: options?.stream});
  return project;
}
