import fs from 'node:fs';
import Mocha from 'mocha';
import yargs from 'yargs';

const argv = require('yargs')
  .string('g').alias('g', 'grep')
  .boolean('i').alias('i', 'invert')
  .argv;

const mocha = new Mocha();
if (argv.grep) mocha.grep(argv.grep);
if (argv.invert) mocha.invert();

for (const f of fs.readdirSync(__dirname)) {
  if (f.endsWith('.spec.ts'))
    mocha.addFile(`${__dirname}/${f}`);
}
mocha.run(process.exit);
