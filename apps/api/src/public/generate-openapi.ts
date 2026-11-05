import fs from 'fs';
import path from 'path';
import { buildOpenApiDocument } from './openapi.js';

const target = path.resolve(import.meta.dirname, '../../../../docs/openapi.json');
fs.writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
console.log(`Wrote ${target}`);
