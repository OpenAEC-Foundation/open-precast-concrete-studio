import { cp, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = join(root, 'target');
const output = join(target, 'desktop-ui');
await mkdir(target, { recursive: true });
const staging = await mkdtemp(join(target, 'desktop-ui-'));
try {
  for (const name of ['index.html', 'src', 'public']) {
    await cp(join(root, name), join(staging, name), { recursive: true });
  }
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
} finally {
  await rm(staging, { recursive: true, force: true });
}
