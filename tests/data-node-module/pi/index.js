const assert = require('node:assert');
const {computePi, manyPies} = require(process.argv[2]);

assert.throws(() => computePi({}));
assert.deepStrictEqual(computePi({useCache: true}), {success: true, value: Math.PI});

assert.deepStrictEqual(manyPies(), new Array(5).fill(Math.PI));
