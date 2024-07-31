#!/usr/bin/env node

import {Builtins, Cli, Command, Option} from 'clipanion';
import {generateCppProject} from './index';
import packageJson from '../package.json';

export class GenCommand extends Command {
  static paths = [ [ 'gen' ] ];
  static usage = Command.Usage({
    description: 'Generate a C++ project from TypeScript project.',
    examples: [
      [
        'Generate at $CWD/cpp-project',
        '$0 gen',
      ],
      [
        'Generate at custom location',
        '$0 gen --target /path/to/cpp-project',
      ],
      [
        'Specify the path of TypeScript project',
        '$0 gen --root /path/to/ts-project --target /path/to/cpp-project',
      ],
    ]
  });

  root = Option.String('--root', {description: 'The path of TypeScript project, default is $CWD'});
  target = Option.String('--target', {description: 'The path of C++ project, default is $CWD/cpp-project'});

  async execute() {
    const root = this.root ?? process.cwd();
    const target = this.target ?? `${process.cwd()}/cpp-project`;
    await generateCppProject(root, target);
  }
}

export class BuildCommand extends Command {
  static paths = [ [ 'build' ] ];
  static usage = Command.Usage({
    description: 'Build C++ project.',
    examples: [
      [
        'Build the $CWD/cpp-project',
        '$0 build',
      ],
      [
        'Build a custom location',
        '$0 build --target /path/to/cpp-project',
      ],
    ]
  });

  target = Option.String('--target', {description: 'The path of C++ project, default is $CWD/cpp-project'});

  async execute() {
  }
}

const cli = new Cli({
  binaryName: `compilets`,
  binaryLabel: 'Compilets',
  binaryVersion: packageJson.version,
});

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
cli.register(GenCommand);
cli.register(BuildCommand);
cli.runExit(process.argv.slice(2)).then(() => process.exit());
