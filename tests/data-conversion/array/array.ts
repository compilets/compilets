class Item {}

class Collection {
  items: Item[] = [];
}

function TestArray() {
  let a: number[];
  const numArr = [1, 2, 3, 4];
  const eleArr = [new Item(), new Item()];

  let c = new Collection();
  c.items = eleArr;
  eleArr = c.items;

  const items = c.items;
}
