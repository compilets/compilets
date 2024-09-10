class Item<T> {
  value?: T;
}

function Passthrough<T>(value: T) {
  return value;
}

function GetValue<U>(item: Item<U>): U {
  return item.value!;
}

function CreateItems<U>(): Item<U>[] {
  return [ new Item<U>() ];
}

function TestGenericFunction() {
  const passStr = Passthrough<string>;
  let str = Passthrough('text');
  str = passStr(str);

  let onion: number | boolean | undefined;
  onion = Passthrough(onion);

  let optional: number | undefined;
  optional = Passthrough(optional);

  let items = CreateItems<string>();
  let item = new Item<string>;
  item.value = Passthrough(item.value);
  item.value = GetValue(item);

  let itemItems = CreateItems<Item<string>>();
  let itemItem = new Item<Item<string>>;
  itemItem.value = Passthrough(itemItem.value);
  itemItem.value = GetValue(itemItem);
  item = Passthrough(itemItem.value);
  item = GetValue(itemItem);
}
