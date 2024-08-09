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
