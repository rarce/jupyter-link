import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(here, '..', '..', 'package.json');
export const VERSION = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
