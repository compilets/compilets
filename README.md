# Compilets

TypeScript to C++ compiler.

This project does not plan to support every TypeScript feature - doing so would
make it downgrade to a JavaScript interpreter - it only translates code that can
be effiently represented in C++. Code relying on JavaScript's dynamic natures,
for example `prototype` and `any`, will be rejected.

There is currently no documentation on which TypeScript syntax and features are
supported, but you can check
[Design](https://github.com/compilets/compilets/blob/main/docs/design.md) and
[Roadmap](https://github.com/compilets/compilets/blob/main/docs/roadmap.md) to
have some ideas on the project's status.

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

  compilets build [--target #0] ...
    Build C++ project.

  compilets gen [--root #0] [--target #0]
    Generate a C++ project from TypeScript project.

  compilets gn-gen <--target #0>
    Run "gn gen" for the C++ project.
```

Example:

```sh
mkdir example
cd example
echo 'class A {}' > main.ts
compilets gen
compilets build
./cpp-project/out/Debug/example
```

## Developement

The documentations of Oilpan GC (cppgc) can be found at:

* [High-performance garbage collection for C++](https://v8.dev/blog/high-performance-cpp-gc)
* [Oilpan: C++ Garbage Collection](https://github.com/compilets/cppgc)
* [Oilpan API reference](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/heap/BlinkGCAPIReference.md)

You can get familiar with TypeScript's compiler APIs with following articles:

* [Gentle Introduction To Typescript Compiler API](https://january.sh/posts/gentle-introduction-to-typescript-compiler-api)
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

This project is published under GPLv3 license, including the C++ files that are
built into the final binary.

I'll change the license to a permissive one when I consider this project as a
ready product.

## Contributions

It is discouraged to submit patches as this project is still an ongoing
experiment. If you are still kind enough to fix bugs, please note that you must
agree to allow me to re-license the contributions to permissive licenses in
future.
