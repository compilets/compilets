import CppProject from './cpp-project';
import Parser from './parser';

export async function generateCppProject(root: string, target: string): Promise<CppProject> {
  const project = new CppProject(root);
  const parser = new Parser(project);
  parser.parse();
  await project.writeTo(target, {generationMode: 'exe'});
  await project.gnGen(target, {config: 'Debug'});
  return project;
}
