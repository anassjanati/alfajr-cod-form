import { readFile, writeFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
for (const name of ['widget', 'extras']) {
  const input = new URL(`./${name}-source.js`, import.meta.url);
  const { code } = await transformWithEsbuild(await readFile(input, 'utf8'), input.pathname, { loader: 'js', minify: true, target: 'es2020' });
  await writeFile(new URL(`../extensions/cod-form/assets/shopping-assistant${name === 'extras' ? '-extras' : ''}.js`, import.meta.url), code);
}
