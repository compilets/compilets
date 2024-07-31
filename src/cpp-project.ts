import fs from 'fs-extra';
import path from 'node:path';
import * as ts from 'typescript';

import CppFile from './cpp-file';
import * as syntax from './cpp-syntax';

interface GenerationOptions {
  generationMode: syntax.GenerationMode;
}

/**
 * Represent a C++ project that can be compiled to executable.
 */
export default class CppProject {
  rootDir: string;
  name: string;
  mainFileName: string;
  fileNames: string[] = [];
  compilerOptions: ts.CompilerOptions;

  files = new Map<string, CppFile>();

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    // Read project name from package.json, and use dir name as fallback.
    let projectName: string | undefined;
    let mainFileName: string | undefined;
    try {
      const {name, main} = fs.readJsonSync(`${rootDir}/package.json`);
      projectName = name;
      if (main)
        mainFileName = `${rootDir}/${main.replace(/\.[^.]+$/, '.ts')}`;
    } catch {}
    this.name = projectName ?? path.basename(rootDir);
    // File config file and read it.
    const configFileName = `${rootDir}/tsconfig.json`;
    if (fs.existsSync(configFileName)) {
      // Get the TypeScript files from config.
      const config = ts.readJsonConfigFile(configFileName, (p) => fs.readFileSync(p).toString());
      const parsed = ts.parseJsonSourceFileConfigFileContent(config, ts.sys, rootDir);
      this.fileNames = parsed.fileNames;
      this.compilerOptions = parsed.options;
    } else {
      // Get the TypeScript files from the rootDir.
      this.fileNames = fs.readdirSync(rootDir).filter(f => f.endsWith('.ts'))
                                              .map(p => `${rootDir}/${p}`);
      this.compilerOptions = {
        rootDir,
        noImplicitAny: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
      };
    }
    // Determine the main file name.
    if (this.fileNames.length == 0)
      throw new Error(`Directory "${rootDir}" contains no TypeScript file`);
    this.mainFileName = mainFileName ?? this.fileNames[0];
  }

  addFile(name: string, file: CppFile) {
    if (this.files.has(name))
      throw new Error(`The file "${name}" already exists in project`);
    this.files.set(name, file);
  }

  getFiles(): CppFile[] {
    return Array.from(this.files.values());
  }

  /**
   * Create a C++ project at `target` directory.
   */
  async writeTo(target: string, options: GenerationOptions) {
    await fs.ensureDir(target);
    const tasks: Promise<void>[] = [];
    tasks.push(this.writeGnFiles(target));
    for (const [name, file] of this.files.entries()) {
      const filepath = `${target}/${name}`;
      await fs.ensureFile(filepath);
      await fs.writeFile(filepath, file.print(options));
    }
    return Promise.all(tasks);
  }

  /**
   * Create a minimal GN project at the `target` directory.
   */
  private async writeGnFiles(target: string) {
    const sources = Array.from(this.files.keys()).map(k => `    "${k}",`).join('\n');
    const buildgn =
`group("default") {
  deps = [ ":${this.name}" ]
}

executable("${this.name}") {
  deps = [ "cpp:runtime" ]
  include_dirs = [ "." ]
  sources = [
${sources}
  ]

  configs -= [ "//build/config/compiler:chromium_code" ]
  configs += [ "//build/config/compiler:no_chromium_code" ]
}
`;
    await Promise.all([
      fs.writeFile(`${target}/BUILD.gn`, buildgn),
      fs.copy(`${__dirname}/../cpp`, `${target}/cpp`),
      fs.copy(`${__dirname}/../cpp/.gn`, `${target}/.gn`),
    ]);
  }
}
