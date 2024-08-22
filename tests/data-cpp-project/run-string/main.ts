let beijing = `tiananmen ${89 + .64}`;
if (beijing != 'tiananmen 89.64') {
  console.error('number print:', beijing);
  process.exit(1);
}

if ('literal' != 'literal') {
  console.error('literal comparison');
  process.exit(2);
}

if ('li' + 'te' + 'ral' != 'literal') {
  console.error('literal concatenation');
  process.exit(3);
}

if ('a' >= 'b') {
  console.error('string ordering');
  process.exit(4);
}

if ('123' == 456) {
  console.error('string number equality');
  process.exit(5);
}

if ('123' >= 456) {
  console.error('string number ordering');
  process.exit(6);
}

if ('a' > 123 || 'a' == 123 || 'a' < 123) {
  console.error('non-number-string number comparison');
  process.exit(7);
}

if ('123' === 123) {
  console.error('string number strict equal');
  process.exit(8);
}
