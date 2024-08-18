import fs from 'node:fs';
import util from 'node:util';
import Mocha from 'mocha';

const argv = require('yargs')
  .string('g').alias('g', 'grep')
  .boolean('i').alias('i', 'invert')
  .argv;
const {values} = util.parseArgs({
  options: {
    grep: {type: 'string', short: 'g'},
    invert: {type: 'string', short: 'i'},
  }
});

const mocha = new Mocha();
if (values.grep) mocha.grep(values.grep);
if (values.invert) mocha.invert();

for (const f of fs.readdirSync(__dirname)) {
  if (f.endsWith('.spec.ts'))
    mocha.addFile(`${__dirname}/${f}`);
}
mocha.run(process.exit);
