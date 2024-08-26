export class View {
  static count = 0;

  children: View[] = [];

  constructor() {
    View.count++;
  }
}

export class Container<T> {
  children: T[] = [];
}
