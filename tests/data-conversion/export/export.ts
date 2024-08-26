export class View {
  static count = 0;

  children: View[] = [];

  constructor() {
    View.count++;
  }
}

export class Container<T> {
  children: T[] = [];

  layout(options: {redraw: boolean}) {
  }
}

export function createView() {
  return new View();
}

export function createContainer<T>() {
  return new Container<T>();
}
