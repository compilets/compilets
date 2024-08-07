class Item {}

class Collection {
  items: Item[] = [];
  maybeItems: (Item | undefined)[] = [undefined];
}

function TestArray() {
  let a: number[];
  const numArr = [1, 2, 3, 4];
  const eleArr = [new Item(), new Item()];

  let c = new Collection();
  c.items = eleArr;
  eleArr = c.items;

  const items = c.items;
  c.items = items;

  const maybeItems = c.maybeItems;
  c.maybeItems = maybeItems;
}
