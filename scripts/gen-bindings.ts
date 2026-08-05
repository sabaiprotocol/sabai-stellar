/**
 * Generates TypeScript bindings for every contract from the built wasm.
 * Output is committed under packages/bindings/ so the frontend builds without
 * a Rust toolchain. Re-run after ANY contract interface change.
 *
 * Four things are fixed up after generation. Every one of them is a property of
 * the CLI's template rather than of this project, so they come back on every
 * regeneration and have to be reapplied here rather than by hand.
 *
 * 1. The CLI pins its own @stellar/stellar-sdk version in the generated
 *    package.json. We re-pin it to the repo-wide version so npm dedupes to a
 *    single SDK copy; two copies mean duplicate XDR types in the bundle and
 *    instanceof checks that quietly fail.
 * 2. It pins its own TypeScript too, and that range does not include the one
 *    the repo uses. npm then installs a second compiler under each package and
 *    the committed dist/ is built by a different tsc than the rest of the repo
 *    typechecks with - the same problem rust-toolchain.toml solves for wasm.
 * 3. Its tsconfig omits `rootDir` while emitting to dist/, which TypeScript 6
 *    reports as an error. It also carries ~90 lines of commented-out template
 *    options; five copies of that is 450 lines of noise in a repo a reviewer
 *    reads.
 * 4. It writes a boilerplate README about publishing to npm and futurenet. It
 *    is not about this project, so it goes.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildContracts, ROOT, stellar, WASM_DIR } from './lib.ts';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const ROOT_PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** Single source of truth for the SDK range, so a bump in the web app cannot
 *  be undone by the next binding regeneration. */
const STELLAR_SDK_VERSION: string = JSON.parse(
  readFileSync(join(ROOT, 'web', 'package.json'), 'utf8'),
).dependencies['@stellar/stellar-sdk'];

/** Likewise for the compiler: one tsc for the whole repo. */
const TYPESCRIPT_VERSION: string = ROOT_PKG.devDependencies.typescript;

/**
 * The generated tsconfig with the dead template options dropped and `rootDir`
 * made explicit. Every option the CLI actually set is preserved, so the emitted
 * layout is unchanged: src/index.ts -> dist/index.js.
 */
const TSCONFIG = {
  compilerOptions: {
    target: 'ESNext',
    module: 'NodeNext',
    moduleResolution: 'nodenext',
    rootDir: './src',
    outDir: './dist',
    declaration: true,
    strictNullChecks: true,
    skipLibCheck: true,
  },
  include: ['src/*'],
};

const CONTRACTS = [
  { wasm: 'compliance_registry.wasm', out: 'registry', name: '@sabai/bindings-registry' },
  { wasm: 'share_token.wasm', out: 'share-token', name: '@sabai/bindings-share-token' },
  { wasm: 'asset_sale.wasm', out: 'asset-sale', name: '@sabai/bindings-asset-sale' },
  { wasm: 'asset_exchange.wasm', out: 'exchange', name: '@sabai/bindings-exchange' },
  { wasm: 'rewards_distributor.wasm', out: 'rewards', name: '@sabai/bindings-rewards' },
];

console.log('Building contracts first...');
buildContracts();

for (const c of CONTRACTS) {
  const outDir = join(ROOT, 'packages', 'bindings', c.out);
  console.log(`Generating bindings: ${c.wasm} -> packages/bindings/${c.out}`);
  stellar([
    'contract',
    'bindings',
    'typescript',
    '--wasm',
    join(WASM_DIR, c.wasm),
    '--output-dir',
    outDir,
    '--overwrite',
  ]);

  const pkgPath = join(outDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = c.name;
  pkg.private = true;
  pkg.dependencies['@stellar/stellar-sdk'] = STELLAR_SDK_VERSION;
  pkg.devDependencies.typescript = TYPESCRIPT_VERSION;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(join(outDir, 'tsconfig.json'), `${JSON.stringify(TSCONFIG, null, 2)}\n`);
  rmSync(join(outDir, 'README.md'), { force: true });
  console.log(
    `  patched ${c.name}: stellar-sdk ${STELLAR_SDK_VERSION}, typescript ${TYPESCRIPT_VERSION}`,
  );
}

// dist/ is committed so the web app builds without a Rust toolchain.
console.log('Installing workspace deps & compiling bindings to dist/...');
execFileSync(NPM, ['install'], { cwd: ROOT, stdio: 'inherit', shell: true });
for (const c of CONTRACTS) {
  execFileSync(NPM, ['run', 'build', '-w', c.name], { cwd: ROOT, stdio: 'inherit', shell: true });
}

console.log('Done.');
