# Compilets

TypeScript to C++ compiler.

Giving a TypeScript project, it can translate the code to C++, and produce
native executables and Node.js modules.

This project does not plan to support every TypeScript feature - doing so would
make it downgrade to a JavaScript interpreter - it only translates code that can
be effiently represented in C++. Code relying on JavaScript's dynamic natures,
for example `prototype` and `any`, will be rejected.

Currently it is still very early days, and it fails to translate most existing
TypeScript projects, but it is capable of turning some performance-critical code
into native Node.js modules.

## Docs

* [A design of translating TypeScript to C++](https://github.com/compilets/compilets/blob/main/docs/design.md)
* [Roadmap](https://github.com/compilets/compilets/blob/main/docs/roadmap.md)
* [Creating native Node.js modules](https://github.com/compilets/compilets/blob/main/docs/node-module.md)

There is currently no documentation on which TypeScript syntax and features are
supported.

## CLI

Install:

```sh
npm install -g compilets
```

Help:

```
━━━ Compilets - 0.0.1-dev ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  $ compilets <command>

━━━ General commands ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  compilets build [--config #0] [--target #0] ...
    Build C++ project.

  compilets gen [--root #0] [--config #0] [--target #0]
    Generate a C++ project from TypeScript project.

  compilets gn-gen [--config #0] <--target #0>
    Run "gn gen" for the C++ project.
```

Example:

```sh
mkdir example
cd example
echo 'console.log("Hello World!")' > main.ts
compilets gen
compilets build
./cpp-project/out/Debug/example
```

## Compatibility with `tsconfig.json` and `package.json`

When compiling a project, the `tsconfig.json` file under the root directory is
used for initializing the TypeScript compiler. If such file is not present,
following `compilerOptions` will be used:

```js
{
  noEmit: true,
  noImplicitAny: true,
  strictNullChecks: true,
  allowImportingTsExtensions: true
}
```

In this case the `.ts` files under the root directory will be used for
compilation, and the files are searched non-recursively.

Also, the `compilerOptions.strictNullChecks` field must be `true` when a
`tsconfig.json` file is provided.

When a `package.json` file is found in the root directory, following rules are
applied:

* The `name` field is used as the project's name.
* If the `compilets.main` field is a `.ts` file, a native module will be
  created.
* If the `compilets.bin` field is an object with values of `.ts` files,
  executables will be created for each entry of the object.

An example `package.json` file:

```json
{
  "name": "download",
  "compilets": {
    "main": "lib.ts",
    "bin": {
      "download": "cli.ts"
    }
  }
}
```

If there is no `package.json` file, the root directory must contain only one
`.ts` file and it will be compiled into executable.

## Developement

The documentations of Oilpan GC (cppgc) can be found at:

* [High-performance garbage collection for C++](https://v8.dev/blog/high-performance-cpp-gc)
* [Oilpan: C++ Garbage Collection](https://github.com/compilets/cppgc)
* [Oilpan API reference](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/heap/BlinkGCAPIReference.md)

You can get familiar with TypeScript's compiler APIs with following articles:

* [Gentle Introduction To TypeScript Compiler API](https://january.sh/posts/gentle-introduction-to-typescript-compiler-api)
* [TypeScript Transformer Handbook](https://github.com/itsdouges/typescript-transformer-handbook)
* [Using the Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)

Tools below will help developement of this project:

* [TypeScript AST Viewer](https://ts-ast-viewer.com/)
* [TypeScript API Reference](https://typestrong.org/typedoc-auto-docs/typedoc/modules/TypeScript.html)

About GN, the build system used for building C++ code:

* [GN Homepage](https://gn.googlesource.com/gn/)
* [GN Reference](https://gn.googlesource.com/gn/+/main/docs/reference.md)
* [Standalone GN](https://github.com/yue/build-gn)

## License

This project is published under GPLv3, the C++ code (`/cpp/runtime`) has a an
extra [linking exception](https://github.com/compilets/compilets/blob/main/cpp/runtime/LICENSE).

In plain words, distributing the compiled executable files does not require you
to open source, only including the source code of this project requires so.

I'll change the license to a permissive one if this project gets enough funding.

## Contributor license agreement

By sending a pull request, you hereby grant to owners and users of this project
a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable
copyright license to reproduce, prepare derivative works of, publicly display,
publicly perform, sublicense, and distribute your contributions and such
derivative works.

The owners of the this project will also be granted the right to relicense the
contributed source code and its derivative works to a more permissive license.
