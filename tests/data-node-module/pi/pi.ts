export function computePi(options?: {useCache: boolean}) {
  return {
    success: true,
    value: Math.PI
  };
}

export function manyPies() {
  return new Array<number>(5).fill(Math.PI);
}
