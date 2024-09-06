const assert = require('node:assert');
const {pi, possiblePi, computePi, manyPies, isPi} = require(process.argv[2]);

assert.strictEqual(pi, Math.PI);

assert.throws(() => computePi({}));
assert.deepStrictEqual(computePi({useCache: true}), {success: true, value: Math.PI});

assert.deepStrictEqual(manyPies(), new Array(5).fill(Math.PI));

assert.ok(isPi(Math.PI));
