export const pi = Math.PI;
export const possiblePi: number | string = "3.14";

export class Pier {
  static fallbackPi = 3.14;
  static doesPiExist() { return true; }

  private useCache: boolean;

  constructor(useCache: boolean) {
    this.useCache = useCache;
  }

  compute() {
    return computePi({useCache: this.useCache}).value;
  }
}

export class SuperPier extends Pier {
  constructor() {
    super(true);
  }

  fastCompute() {
    return pi;
  }
}

export function computePi(options?: {useCache: boolean}) {
  return {
    success: true,
    value: Math.PI
  };
}

export function manyPies() {
  return new Array<number>(5).fill(Math.PI);
}

export function isPi(value: string | number) {
  return Number(value) - Math.PI < 0.01;
}
