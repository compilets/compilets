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
