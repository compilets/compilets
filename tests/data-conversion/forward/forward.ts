function main() {
  find(undefined);
}

function find(options?: {fallback: Holder}): {success: boolean, result: Holder} {
  if (options) {
    return {success: true, result: options.fallback};
  } else {
    return {success: false, result: new Holder()};
  }
}

class Holder {
  data?: {
    id: number,
    item: Item,
  };
}

class Item {
}
