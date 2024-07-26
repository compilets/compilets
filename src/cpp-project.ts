import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {unzip} from '@compilets/unzip-url';

import CppFile from './cpp-file';
import * as syntax from './cpp-syntax';

const execFileAsync = promisify(execFile);

interface GenerationOptions {
  mode: syntax.GenerationMode;
}

/**
 * Represent a C++ project that can be compiled to executable.
 */
export default class CppProject {
  name: string;
  files = new Map<string, CppFile>();

  constructor(name: string) {
    this.name = name;
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
  async gnGen(target: string) {
    const gnDir = await this.downloadGn();
    let gn = `${gnDir}/gn`;
    if (process.platform == 'win32')
      gn += '.exe';
    await execFileAsync(gn, [ 'gen', 'out' ], {cwd: target});
  }

  /**
   * Compile the project at `target`
   */
  async ninjaBuild(target: string) {
    const gnDir = await this.downloadGn();
    let ninja = `${gnDir}/ninja`;
    if (process.platform == 'win32')
      ninja += '.exe';
    await execFileAsync(ninja, [ '-C', 'out' ], {cwd: target});
  }

  /**
   * Create a minimal GN project at the `target` directory.
   */
  private async writeGnFiles(target: string) {
    const sources = Array.from(this.files.keys()).map(k => `"${k}",`).join('\n');
    const buildgn =
`executable("${this.name}") {
  sources = [
    ${sources}
  ]
}`;
    await Promise.all([
      fs.writeFile(`${target}/BUILD.gn`, buildgn),
      fs.writeFile(`${target}/.gn`, 'use_chromium_config = true\n'),
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
    return gnDir;
  }
}

// Helper to return the user's cache directory.
function getCacheDir() {
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
