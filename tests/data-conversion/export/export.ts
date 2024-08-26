export class View {
  static count = 0;

  children: View[] = [];

  constructor() {
    View.count++;
  }
}
