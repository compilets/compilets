const assert = require('node:assert');
const {Pier, pi, possiblePi, computePi, manyPies, isPi} = require(process.argv[2]);

assert.strictEqual(pi, Math.PI);

assert.throws(() => computePi({}));
assert.deepStrictEqual(computePi({useCache: true}), {success: true, value: Math.PI});

assert.deepStrictEqual(manyPies(), new Array(5).fill(Math.PI));

assert.ok(isPi(Math.PI));
assert.ok(isPi(possiblePi));

assert.ok(Pier.doesPiExist());
assert.ok(isPi(Pier.fallbackPi));

const pier = new Pier(true);
assert.strictEqual(pier.compute(), Math.PI);
