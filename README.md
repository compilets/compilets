# Compilets

TypeScript to C++ compiler.

To have an idea of how the converted code looks like, you can check the
[`tests/data-conversion/`](https://github.com/compilets/compilets/tree/main/tests/data-conversion)
directory.

Note that this is an ongoing research and not production ready, if you are
looking for a compiler that works with real code, please check
[TypeScript2Cxx](https://github.com/ASDAlexander77/TypeScript2Cxx) and lots of
[other options](https://news.ycombinator.com/item?id=22756657).

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

## Principles

* Only the static part of TypeScript will be supported - for example there is no
  support for prototype manipulation, object literal and Record are separate
  types that can not be converted to each other.
* Interoperability with Node.js - the TypeScript code should be able to be
  compiled into a native module that works with the JavaScript code.
* Language support comes first than runtime - this project will focus on
  implementing core TypeScript language support first, things like Object and
  String's methods will only be implemented at very last.

## The unusual parts

The reason this project was created despite the existences of all other ones, is
that I believe the C++ and TypeScript languages have some subtle overlaps and
there is a beautiful way to map TypeScript code to C++.

This project means to validate my ideas which I did not find anywhere else.

### Oilpan GC

The Oilpan GC is a garbage collection library designed for V8, but also can be
used as an independant library. Compilets uses Oilpan to implement the GC in
translated C++ code.

Most existing TypeScript to C++ compilers manage the lifetime of objects with
`std::shared_ptr`, which is simple reference counting and leaks for cyclic
references.

With Compilets you can safely translate a cyclic referenced class to C++:

```typescript
class LinkNode {
  next?: LinkNode;
}

const a = new LinkNode();
const b = new LinkNode();
a.next = b;
b.next = a;
```

```cpp
class LinkNode : public compilets::Object {
 public:
  cppgc::Member<LinkNode> next;

  void Trace(cppgc::Visitor* visitor) const override {
    visitor->Trace(next);
  }
};

LinkNode* a = compilets::MakeObject<LinkNode>();
LinkNode* b = compilets::MakeObject<LinkNode>();
a->next = b;
b->next = a;
```

### Function object

In TypeScript a function is also an Object, while it is trivial to use lambda
functions in C++ to represent functions objects, the lifetime of the function
and the objects captured in its closure still needs management. In the meanwhile
using `std::function` for everything would hurt the performance.

This is solved by using a custom C++ object to represent function expressions
and arrow functions (i.e. the ones assigned to variables), while still using
the plain C++ functions to represent the top-level function declarations.

For lifetime management, the function object is managed by Oilpan GC. And the
function body is parsed so all the objects captured in the closure become
hiddden members of the function object, managed by Oilpan GC too.

```typescript
function Simple() {}

let simple = Simple;
let callback = () => { simple() };
```

```cpp
void Simple() {}

compilets::Function<void()>* simple = compilets::MakeFunction<void()>(Simple);
compilets::Function<void()>* callback = compilets::MakeFunction<void()>([=]() -> void {
  simple->value()();
}, simple);
```

### Union types and `std::variant`

The union types in TypeScript are represented as `std::variant` in C++, for
example `number | string` becomes `std::variant<double, std::string>`.

For union types that includes `undefined`, the `std::monostate` is used to
represent the empty state.

### Question mark and `std::optional`

The optional function parameters and class properties in TypeScript are
represented as `std::optional` in C++. For example `func(arg?: boolean)` becomes
`func(std::optional<bool> arg)`.

### `null` and `undefined`

Unlike JavaScript, there is no undefined state for variables in C++, it is
possible simulate `undefined` but it would be at the cost of performance.

Thus in Compilets both `null` and `undefined` are treated as null states of
types: `std::nullopt` for `std::optional`, `std::monostate` for `std::variant`,
`std::nullptr` for other pointer types. This will of course break some even
strictly typed code, and to avoid generating incorrect code, errors will be
thrown when the TypeScript code needs to strictly distinguish between `null`
and `undefined`.

### String

Technically string is an object type in JavaScript, however since we are not
going to support prototype manipulation, it is safe to treat string as a
primitive type in C++, which simplifies things a lot and helps performance.

On the other hand, in TypeScript code assigning a string to a variable involves
no copy, and we can not just represent strings as `std::string`, which would
be very slow when the TypeScript code pass strings around.

So in Compilets string is represented as a custom type that stores string in a
`std::shared_ptr`:

```cpp
class String {
  std::shared_ptr<std::u16string> value;
};
```

For string concatenations like `"a" + "b" + "c"`, it is optimized to use the
StringBuilder pattern:

```cpp
StringBuilder().Append("a").Append("b").Append("c")
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
