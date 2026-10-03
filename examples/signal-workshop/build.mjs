import { copyFile, mkdir } from 'node:fs/promises';
const output = new URL('../../.game-build/examples/signal-workshop/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'style.css', 'tutorial.html', 'tutorial.css']) {
  await copyFile(new URL(name, import.meta.url), new URL(name, output));
}
console.log('Built Night Shift in .game-build/');
