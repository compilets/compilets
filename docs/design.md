# Design

Modern C++ has evolved to support fancy syntax which you could only find in
scripting languages before. In this document we discuss how TypeScript code can
be translated to C++ in a beautiful way, with minimum runtime overhead.

## Oilpan GC

The Oilpan GC is a garbage collection library designed for V8, but can also be
used as an independant library. Compilets uses Oilpan to implement the garbage
collection in translated C++ code, which handles cyclic references correctly.

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

## Function object

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

## Union types and `std::variant`

The union types in TypeScript are represented as `std::variant` in C++, for
example `number | string` becomes `std::variant<double, std::string>`.

For union types that includes `undefined`, the `std::monostate` is used to
represent the empty state.

When calling a method or getting a property on a union type, `std::visit` is
used:

```typescript
let obj: A | B | C;
obj.method();
```

```cpp
std::variant<A*, B*, C*> obj;
std::visit([](auto&& arg) { arg->method(); }, obj);
```

## Question mark and `std::optional`

The optional function parameters and class properties in TypeScript are simply
represented as `std::optional` in C++ for most cases, for example the
`func(arg?: boolean)` signature becomes `func(std::optional<bool> arg)`.

For object types like class and function, since they are already represented
as pointers, wrapping them with `std::optional` would be wasteful, so they
are always pointers regardless they are optional or not.

## `null` and `undefined`

Unlike JavaScript, there is no undefined state for variables in C++, it is
possible simulate `undefined` but it would be at the cost of performance.

Thus in Compilets both `null` and `undefined` are treated as null states of
types: `std::nullopt` for `std::optional`, `std::monostate` for `std::variant`,
`std::nullptr` for other pointer types. This will of course break some even
strictly typed code, and to avoid generating incorrect code, errors will be
thrown when the TypeScript code needs to strictly distinguish between `null`
and `undefined`.

## String

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

## Generics

The type parameters of TypeScript can be directly translated to C++ template
without much efforts for most cases:

```typescript
class Generic<U> {
  member: U;
}
```

```cpp
template<typename U>
class Wrapper : public compilets::Object {
  compilets::CppgcMemberType<U> member;
};
```

For generic constraints like `Generic<Type extends Interface>`, the constraints
part can be ignored as we do not need to check the constraints in the translated
code.

One pitfall is that TypeScript allows declaring a generic function object:

```typescript
let func = function<T>(value: T) {}
```

There is no way that we could translate it to C++, because allocated variable's
type must be known at compile time in languages with static type. This kind of
function object declaration throws errors in Compilets.

And of course top-level generic function declarations works fine:

```typescript
function Passthrough<T>(value: T) {
  return value;
}
```

```c++
template<typename T>
compilets::ValueType<T> Passthrough(compilets::ValueType<T> value) {
  return value;
}
```

You may notice that we are using type traits instead of template parameter `T`
directly, that's because the same type in TypeScript may be different types
in C++ depending on the context (for example `cppgc::Member<Object>` vs
`Object*`), and since we do not know the actual type of generics, we rely on
C++ type traits to ensure correct type is deduced.

## Interface

The `interface` in TypeScript is not really the interfaces you would find in
other languages: you can create object literals without types and the compiler
decides whether the object satisfies the interface. The closest thing to it in
C++ is concepts, but we can not declare variables with concepts.

To support the `interface` keyword as much as we can while still making
generated code static (i.e. member names and types are known at compile time),
following strategy is taken:

* An `interface` is translated to C++ `struct`;
* Creating an object literal implicitly creates an interface for its type;
* Interfaces with same properties become the same interface;
* An object is only considered satisfying the interface when it is declared to
  have the type of the interface.
* Inheritance relationship between interfaces is not translated, if an interface
  extends another, it simply gets all the base type's properties.

Many cases do not compile under this strategy though, for example:

* An object with excess properties can not satisfy an interface with less
  properties.
* An instance of class does not satisfy any interface.

A solution to partially solve these cases is to turn functions accepting
interfaces into template functions, with interface parameters becoming template
parameters. We might try this solution if requests for it are popular.

## Module

C++20 introduced a modules system for C++, but it is not powerful enough to
translate the module system of TypeScript. Luckily the `namespace` of C++ can
almost perfectly implement the semantics of TypeScript's `import` and `export`.

When exporting a symbol, the C++ code is generated with following rules:

* The code in each file lives in an unique namespace.
* The declarations of exported symbols are put in the `.h` file.
* The definitions of all the symbols (except for template class and function)
  live in the `.cpp` files, and unexported symbols are put in an anonymous
  namespace.

These rules ensure that the symbols in one file will never conflict with symbols
of other files.

```typescript
// view.ts
function internalCreateView() {
}

export function createView() {
  return internalCreateView();
}
```

```c++
// view.h
namespace app::view {

void createView();

}  // namespace app:view
```

```c++
// view.cpp
#include "view.h"

namespace app::view {

namespace {

void internalCreateView() {
}

}  // namespace

void createView() {
  return internalCreateView();
}

}  // namespace app:view
```

And when importing a symbol:

* The imported module's `.h` file is `#include`d.
* For namespace import like `import * as gui from 'module'`, a namespace alias
  is created with `namespace gui = app::module_namespace`.
* For named import like `import {View} from 'module'`, the type is imported to
  current namespace with `using app::module_namespace::View`;
* For named import with alias like `import {View as MyView} from 'module'`, a
  type alias is created with `using MyView = app::module_namespace::View;`;

Note that the alias rules are not really required for generating correct C++
code, we can always access exported symbols with full namespaces specifiers. But
for the purpose of generating readable C++ code, the `import`s are translated to
match their semantics in TypeScript.

```typescript
import * as gui from './module';
import {Container, View as MyView} from './module';
```

```c++
#include "module.h"

namespace gui = app::module_namespace;
using MyView = app::module_namespace::View;
using app::module_namespace::Container;
```