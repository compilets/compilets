import {View as MyView, Container} from './base';

export function createView() {
  checkLeaks();
  return new MyView();
}

export function createContainer<T>() {
  return new Container<T>();
}

function checkLeaks() {
  if (MyView.count > 1000) {
  }
}
