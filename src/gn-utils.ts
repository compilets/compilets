import fs from 'fs-extra';
import os from 'node:os';
import {spawn, execSync, SpawnOptions} from 'node:child_process';
import {unzip} from '@compilets/unzip-url';

interface CommonGnOptions {
  config: 'Release' | 'Debug';
  stream?: boolean;
}

interface GnGenOptions extends CommonGnOptions {
  ccWrapper?: string;
}

interface NinjaBuildOptions extends CommonGnOptions {
  target?: string;
}

/**
 * Run `gn gen` at `targetDir`.
 */
export async function gnGen(targetDir: string, options: GnGenOptions) {
  const gnDir = await downloadGn();
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
  await spawnAsync(gn,
                   [ 'gen', outDir, `--args=${args.join(' ')}` ],
                   {cwd: targetDir, stdio: options.stream ? 'inherit' : 'pipe'});
}

/**
 * Compile the project at `targetDir`.
 */
export async function ninjaBuild(targetDir: string, options: NinjaBuildOptions) {
  const gnDir = await downloadGn();
  let ninja = `${gnDir}/ninja`;
  if (process.platform == 'win32')
    ninja += '.exe';
  const outDir = 'out/' + options.config ?? 'Release';
  await spawnAsync(ninja,
                   [ '-C', outDir, options.target ?? 'default' ],
                   {cwd: targetDir, stdio: options.stream ? 'inherit' : 'pipe'});
}

/**
 * Download standalone GN to user's cache directory.
 * @returns The directory of GN.
 */
export async function downloadGn(): Promise<string> {
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

/**
 * Return the user's cache directory.
 */
export function getCacheDir(): string {
  const {env, platform} = process;
  if (env.XDG_CACHE_HOME)
    return `${env.XDG_CACHE_HOME}/compilets`;
  if (platform == 'darwin')
    return `${os.homedir()}/Library/Caches/compilets`;
  if (platform != 'win32')
    return `${os.homedir()}/.cache/compilets`;
  if (env.LOCALAPPDATA)
    return `${env.LOCALAPPDATA}/compilets-cache`;
  return `${os.homedir()}/.compilets-cache`;
}

/**
 * Return whether ccache is available.
 */
export function hasCcache(): boolean {
  try {
    execSync('ccache -s');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Await until spawn finishes.
 */
export function spawnAsync(cmd: string, args: string[], options: SpawnOptions): Promise<void> {
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
