import path from 'node:path';
import CppFile from './cpp-file';
import CppProject from './cpp-project';
import Parser from './parser';
import {GnGenOptions, gnGen} from './gn-utils';

export {CppFile, CppProject, Parser};
export * from './gn-utils';

/**
 * Create a project from `root`, parser it and generate build files to `target`.
 */
export async function generateCppProject(root: string,
                                         target: string,
                                         options?: GnGenOptions): Promise<CppProject> {
  const project = new CppProject(root);
  // Make sure an executable is always generated.
  if (!project.mainFileName && !project.executables) {
    if (project.fileNames.length > 1)
      throw new Error('The directory has multiple files and does not specify a main file');
    project.executables = {
      [project.name]: path.relative(project.rootDir, project.fileNames[0]),
    };
  }
  const parser = new Parser(project);
  parser.parse();
  await project.writeTo(target);
  await gnGen(target, {config: options?.config ?? 'Release', stream: options?.stream});
  return project;
}
