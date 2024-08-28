export class View {
  static count = 0;

  children: View[] = [];

  constructor() {
    View.count++;
  }

  redraw(options: {force: boolean}) {
  }
}

export class Container<T> {
  children: T[] = [];

  layout(options: {redraw: boolean}) {
  }
}

export function createView() {
  checkLeaks();
  return new View();
}

export function createContainer<T>() {
  return new Container<T>();
}

function checkLeaks() {
  if (View.count > 1000) {
  }
}
