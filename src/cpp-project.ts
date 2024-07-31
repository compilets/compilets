import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {spawn, execSync, SpawnOptions} from 'node:child_process';
import {unzip} from '@compilets/unzip-url';
import * as ts from 'typescript';

import CppFile from './cpp-file';
import * as syntax from './cpp-syntax';

interface GenerationOptions {
  generationMode: syntax.GenerationMode;
}

interface GnGenOptions {
  config: 'Release' | 'Debug';
  ccWrapper?: string;
}

interface GnBuildOptions {
  config: 'Release' | 'Debug';
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
   * Run `gn gen` at `target` directory.
   */
  async gnGen(target: string, options: GnGenOptions) {
    const gnDir = await this.downloadGn();
    let gn = `${gnDir}/gn`;
    if (process.platform == 'win32')
      gn += '.exe';
    const args = [
      `is_debug=${options.config == 'Debug'}`,
      'is_component_build=false',
      'clang_use_chrome_plugins=false',
    ];
    if (options.ccWrapper)
      args.push(`cc_wrapper="${options.ccWrapper}"`);
    else if (hasCcache())
      args.push('cc_wrapper="ccache"');
    const outDir = 'out/' + options.config ?? 'Release';
    await spawnAsync(gn, [ 'gen', outDir, `--args=${args.join(' ')}` ], {cwd: target});
  }

  /**
   * Compile the project at `target`
   */
  async ninjaBuild(target: string, options: GnBuildOptions) {
    const gnDir = await this.downloadGn();
    let ninja = `${gnDir}/ninja`;
    if (process.platform == 'win32')
      ninja += '.exe';
    const outDir = 'out/' + options.config ?? 'Release';
    await spawnAsync(ninja, [ '-C', outDir, this.name ], {cwd: target});
  }

  /**
   * Create a minimal GN project at the `target` directory.
   */
  private async writeGnFiles(target: string) {
    const sources = Array.from(this.files.keys()).map(k => `    "${k}",`).join('\n');
    const buildgn =
`executable("${this.name}") {
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

  /**
   * Download standalone GN to user's cache directory.
   * @returns The directory of GN.
   */
  private async downloadGn(): Promise<string> {
    const version = 'v0.11.1';
    const gnDir = `${getCacheDir()}/build-gn`;
    // Check if downloaded version matches target.
    const versionFile = `${gnDir}/.version`;
    try {
      if (version == (await fs.readFile(versionFile)).toString())
        return gnDir;
      await fs.remove(gnDir);
    } catch {}
    // Download and unzip GN.
    const platform = ({
      win32: 'win',
      linux: 'linux',
      darwin: 'mac',
    } as Record<string, string>)[process.platform as string];
    const url = `https://github.com/yue/build-gn/releases/download/${version}/gn_${version}_${platform}_${process.arch}.zip`;
    await unzip(url, gnDir);
    await fs.writeFile(versionFile, version);
    // Download clang.
    const python = process.platform == 'darwin' ? 'python3' : 'python';
    await spawnAsync(python, [ 'tools/clang/scripts/update.py' ], {cwd: gnDir});
    return gnDir;
  }
}

// Helper to return the user's cache directory.
function getCacheDir(): string {
  const {env, platform} = process;
  if (env.XDG_CACHE_HOME)
    return path.join(env.XDG_CACHE_HOME, 'compilets');
  if (platform == 'darwin')
    return path.join(os.homedir(), 'Library/Caches/compilets');
  if (platform != 'win32')
    return path.join(os.homedir(), '.cache/compilets');
  if (env.LOCALAPPDATA)
    return path.join(env.LOCALAPPDATA, 'compilets-cache');
  return path.join(os.homedir(), '.compilets-cache');
}

// Helper to return whether ccache is available.
function hasCcache(): boolean {
  try {
    execSync('ccache -s');
    return true;
  } catch (error) {
    return false;
  }
}

// Await until spawn finishes.
function spawnAsync(cmd: string, args: string[], options: SpawnOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    let child = spawn(cmd, args, options);
    let output = '';
    child.stdout?.on('data', (chunk) => output += chunk);
    child.stderr?.on('data', (chunk) => output += chunk);
    child.once('close', (code) => {
      if (code == 0)
        resolve();
      else
        reject(new Error(`spawn "${cmd}" exited with ${code}: ${output}`));
    });
  });
}
