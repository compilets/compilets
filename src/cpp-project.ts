import fs from 'fs-extra';
import path from 'node:path';
import * as ts from 'typescript';

import CppFile from './cpp-file';
import {downloadNodeHeaders} from './gn-utils';
import * as syntax from './cpp-syntax';

/**
 * Represent a C++ project that can be compiled to executable.
 */
export default class CppProject {
  rootDir: string;
  name!: string;
  sourceRootDir: string;
  mainFileName?: string;
  executables?: Record<string, string>;
  fileNames: string[] = [];
  compilerOptions: ts.CompilerOptions;

  // Key is filename without suffix - both .h and .cpp use the same CppFile.
  private cppFiles = new Map<string, CppFile>();

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.initializeWithRootDir(rootDir);
    // Intialize TypeScript project.
    const configFileName = `${rootDir}/tsconfig.json`;
    if (fs.existsSync(configFileName)) {
      // Get the TypeScript files from config.
      const config = ts.readJsonConfigFile(configFileName, (p) => fs.readFileSync(p).toString());
      const parsed = ts.parseJsonSourceFileConfigFileContent(config, ts.sys, rootDir);
      if (parsed?.options.strictNullChecks !== true)
        throw new Error('The strictNullChecks is required to be set to true');
      this.sourceRootDir = parsed.options.rootDir ?? rootDir;
      this.fileNames = parsed.fileNames;
      this.compilerOptions = parsed.options;
    } else {
      // Get the TypeScript files from the rootDir.
      this.sourceRootDir = rootDir;
      this.fileNames = fs.readdirSync(rootDir).filter(f => f.endsWith('.ts'))
                                              .map(p => `${rootDir}/${p}`);
      this.compilerOptions = {
        rootDir,
        noImplicitAny: true,
        strictNullChecks: true,
        allowImportingTsExtensions: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
      };
    }
    // Warn about empty directory.
    if (this.fileNames.length == 0)
      throw new Error(`Directory "${rootDir}" contains no TypeScript file`);
  }

  /**
   * Add the result of a parsed TypeScript file.
   *
   * The `name` has not .cpp/.h extension, as both header and impl files are
   * printed using the same CppFile instance.
   */
  addParsedFile(name: string, file: CppFile) {
    if (this.cppFiles.has(name))
      throw new Error(`The file "${name}" already exists in project`);
    this.cppFiles.set(name, file);
  }

  /**
   * Get the type of file according to 'mainFileName' and 'executables'.
   */
  getFileType(fileName: string) {
    const isExecutable = this.executables &&
                         Object.values(this.executables).includes(fileName);
    if (this.mainFileName == fileName) {
      if (isExecutable)
        throw new Error('Can not specify a file as both module main script and bin script');
      return 'napi';
    }
    return isExecutable ? 'exe' : 'lib';
  }

  /**
   * Return all the files this project will generate.
   *
   * The result is a tuple with first value being the actual filename with the
   * .cpp/.h extension.
   */
  getFiles(): [string, CppFile][] {
    const result: [string, CppFile][] = [];
    for (const [ name, file ] of this.cppFiles) {
      if (file.hasExports())
        result.push([ name + '.h', file ]);
      // The .cpp is listed after .h so common headers do not print twice.
      result.push([ name + '.cpp', file ]);
    }
    return result;
  }

  /**
   * Yield filename and printed content at each generation.
   */
  *getPrintedFiles(): Generator<[string, string], void> {
    const headers = new Map<string, syntax.PrintContext>();
    for (const [ name, file ] of this.getFiles()) {
      const mode = name.endsWith('.h') ? 'header' : 'impl';
      const ctx = new syntax.PrintContext(mode, 2);
      // When printing .cpp files, there is no need to print includes and
      // interfaces which were already printed in .h files.
      if (name.endsWith('.cpp')) {
        const header = headers.get(name.replace(/.cpp$/, '.h'));
        if (header) {
          ctx.includedFeatures = header.features;
          ctx.includedInterfaces = header.interfaces;
        }
      } else if (name.endsWith('.h')) {
        headers.set(name, ctx);
      }
      yield [ name, file.print(ctx) ];
    }
  }

  /**
   * Set project info from package.json file.
   */
  async initializeWithRootDir(rootDir: string) {
    try {
      const {name, compilets} = fs.readJsonSync(`${rootDir}/package.json`);
      this.name = name;
      // The "compilets" field stores our configurations.
      if (typeof compilets == 'object') {
        const {main, bin} = compilets;
        // The entry for native module.
        if (typeof main == 'string' && main.endsWith('.ts'))
          this.mainFileName = main;
        // Entries for executables.
        if (bin) {
          for (const [key, value] of Object.entries(bin)) {
            if (typeof value != 'string' || !value.endsWith('.ts'))
              continue;
            if (!this.executables)
              this.executables = {};
            this.executables[key] = value;
          }
        }
      }
    } catch {}
    // Use directory's name as fallback.
    if (!this.name)
      this.name = path.basename(rootDir);
  }

  /**
   * Create a C++ project at `target` directory.
   */
  async writeTo(target: string) {
    await fs.ensureDir(target);
    const tasks: Promise<void>[] = [];
    tasks.push(this.writeGnFiles(target));
    for (const [ name, content ] of this.getPrintedFiles()) {
      const filepath = `${target}/${name}`;
      await fs.ensureFile(filepath);
      await writeFile(filepath, content);
    }
    return Promise.all(tasks);
  }

  /**
   * Create a minimal GN project at the `target` directory.
   */
  private async writeGnFiles(target: string) {
    // The common config that every target should have.
    const commonConfig = `
  configs -= [
    "//build/config/compiler:chromium_code",
    "//build/config/compiler:no_exceptions",
  ]
  configs += [ "//build/config/compiler:no_chromium_code" ]`;
    const buildgn: string[] = [];
    const targets: string[] = [];
    const libname = `lib${this.name}`;
    const sourcesLib = this.getFiles().filter(([ name, file ]) => file.type == 'lib')
                                      .map(([ name, file ]) => name);
    // Pretty print a list of files.
    const concatFiles = (fileNames: string[]) => {
      return fileNames.map(name => `    "${name}",`).join('\n');
    };
    // If this is a multi-file project with multiple executables, create a
    // source_set for common files.
    const hasSourceSet = sourcesLib.length > 0 &&
                         this.executables &&
                         Object.keys(this.executables).length > 1;
    if (hasSourceSet) {
      targets.push(libname);
      buildgn.push(
`source_set("${libname}") {
  sources = [
${concatFiles(sourcesLib)}
  ]

  public_deps = [ "cpp:runtime_exe" ]
  public_configs = [ "cpp:app_config" ]
${commonConfig}
}`);
    }
    // Create native module target.
    if (this.mainFileName) {
      const name = this.mainFileName.replace(/\.ts$/, '');
      targets.push(name);
      buildgn.push(
`loadable_module("${name}") {
  output_name = "${name}"
  output_extension = "node"
  output_prefix_override = true  # do not add "lib" prefix

  sources = [ "${name}.cpp" ]
  if (is_win) {
    sources += [ "cpp/runtime/delay_load_hook_win.cc" ]
  }

  deps = [ "cpp:runtime_node" ]
  configs += [ "cpp:app_config" ]

  defines = [ "NODE_GYP_MODULE_NAME=$output_name" ]
${commonConfig}
}`);
    }
    // Create executable targets.
    if (this.executables) {
      for (const name in this.executables) {
        const fileName = this.executables[name].replace(/\.ts$/, '.cpp');
        let executableConfig = '';
        if (hasSourceSet) {
          executableConfig +=
`  sources = [ "${fileName}" ]
  deps = [ ":${libname}" ]`;
        } else {
          executableConfig +=
`  sources = [
${concatFiles([fileName, ...sourcesLib])}
  ]

  deps = [ "cpp:runtime_exe" ]
  configs += [ "cpp:app_config" ]`;
        }
        targets.push(name);
        buildgn.push(
`executable("${name}") {
${executableConfig}
${commonConfig}
}`);
      }
    }
    // Add the default group.
    buildgn.push(
`group("default") {
  deps = [
${targets.map(t => `    ":${t}",`).join('\n')}
  ]
}`);
    // Copy C++ dependencies.
    const tasks = [
      writeFile(`${target}/BUILD.gn`, buildgn.join('\n\n')),
      fs.copy(`${__dirname}/../cpp`, `${target}/cpp`, {filter}),
      fs.copy(`${__dirname}/../cpp/.gn`, `${target}/.gn`, {filter}),
    ];
    if (this.mainFileName) {
      // Download node headers and copy them to target directory.
      tasks.push((async () => {
        const headersDir = await downloadNodeHeaders();
        await fs.copy(headersDir, `${target}/cpp/node-headers`, {filter});
      })());
    }
    await Promise.all(tasks);
  }
}

// Only write file when content has changed.
async function writeFile(target: string, content: string) {
  try {
    const oldContent = await fs.readFile(target);
    if (oldContent.toString() == content)
      return;
  } catch {}
  await fs.writeFile(target, content);
}

// Filter function used by fs.copy to only write when content has changed.
async function filter(source: string, target: string) {
  try {
    const newContent = await fs.readFile(source);
    const oldContent = await fs.readFile(target);
    if (Buffer.compare(newContent, oldContent) == 0)
      return false;
  } catch {
    return true;
  }
  return true;
}
