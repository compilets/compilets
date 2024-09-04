class Item {}

class Collection {
  items: Item[] = [];
  maybeItems: (Item | undefined)[] = [undefined];
  multiItems: (Item | number)[] = [123];
}

function TestArray() {
  let a: number[];
  a = [8964];
  let element = a[0];
  let indexOptional: number | undefined = 0;
  element = a[indexOptional];
  let indexUnion: number | boolean = 0;
  element = a[indexUnion];

  const numArr = [1, 2, 3, 4];
  let eleArr = [new Item(), new Item()];
  let multiElement = (a[0] == 1984 ? a : numArr)[0];

  let c = new Collection();
  c.items = eleArr;
  eleArr = c.items;

  const items = c.items;
  c.items = items;

  const maybeItems = c.maybeItems;
  c.maybeItems = maybeItems;

  const multiItems = c.multiItems;
  c.multiItems = multiItems;
}
