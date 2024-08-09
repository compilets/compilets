let beijing = `tiananmen ${89 + .64}`;
if (beijing != 'tiananmen 89.64') {
  console.error('wrong result:', beijing);
  process.exit(1);
}
