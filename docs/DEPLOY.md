# Hosting the dApp

The five contracts are already on testnet and this page has nothing to do with
them — `scripts/npm run deploy` is what puts contracts on the ledger. What
follows is only about serving `web/`, the front end that talks to them.

The app has no backend. It reads the ledger over public Soroban RPC and every
signature happens inside Freighter, so there is no server-side secret to leak
and nothing to protect beyond the static build itself.

## The one thing that makes this non-obvious

`web/` is an npm workspace, not a standalone app, and it reaches outside its own
directory twice:

| What reaches out | Where it goes |
| --- | --- |
| [`web/src/lib/stellar.ts`](../web/src/lib/stellar.ts) | `../../../deployments/testnet.json` — the contract addresses |
| [`web/src/config/documents.ts`](../web/src/config/documents.ts) | the same file, for the anchored document hashes |
| `@sabai/bindings-*` dependencies | `packages/bindings/*`, resolved from the repository root |

So a host that copies only `web/` into the build container will fail at module
resolution. The whole repository has to be present, with the build run from
`web/`. Everything below is that one requirement, spelled out per host.

## Vercel

[`web/vercel.json`](../web/vercel.json) pins the framework, the build command
and the output directory. The rest are project-level settings that Vercel keeps
in its dashboard rather than in the repository, so they have to be set once at
import:

| Setting | Value | Why |
| --- | --- | --- |
| Root Directory | `web` | Where the Next.js app lives |
| Include files outside of the Root Directory | on | The three reach-outs above. Off, the build fails on `deployments/testnet.json` |
| Node.js Version | 24.x | Matches `engines.node` in the root `package.json` |

Import at [vercel.com/new](https://vercel.com/new). The repository sits in the
`sabaiprotocol` organization, so the Vercel GitHub App has to be installed on
that organization before it appears in the list — *Adjust GitHub App
Permissions* if it does not.

Node 24 is what the repository declares and what the build is verified against.
If the dashboard does not offer 24.x, 22.x builds the front end too; the 24.18
floor comes from the deploy tooling in `scripts/`, not from Next.js.

## Environment

One variable, and it is optional:

```
NEXT_PUBLIC_BASE_URL = https://<domain>          # no trailing slash
```

It is the `metadataBase` in [`web/src/app/layout.tsx`](../web/src/app/layout.tsx),
which turns the Open Graph and Twitter card image paths into absolute URLs.
Unset, it falls back to `http://localhost:3030` and the only symptom is a broken
preview image when the link is pasted into a chat. Set it after the first deploy,
once the domain is known, and redeploy.

Nothing else is read from the environment. The contract addresses, the wasm
hashes and the document anchors all come from `deployments/testnet.json`, which
is committed on purpose: everything in it is public on the ledger anyway, and a
reviewer checking the app against the chain should not have to be told the
addresses out of band.

Never set `DEPLOYER_SECRET`, `TREASURY_SECRET` or any other key from `.env` as a
hosting environment variable. The front end has no code path that would read one.

## Somewhere other than Vercel

`next build` prerenders all seven routes and the app has no server-rendered data,
but it is still a standard Next.js build rather than a plain folder of files. Any
host that can run the repository's install from the root and then `next start`
from `web/` will serve it — or add `output: 'export'` to
[`web/next.config.ts`](../web/next.config.ts) and upload `web/out/` anywhere at all.

```bash
npm install                 # from the repository root, links the workspaces
npm run build --workspace web
npm run start --workspace web   # port 3030
```

CI already runs this build on every push, so a red deployment that is green in
[`.github/workflows/`](../.github/workflows/) is a hosting configuration problem
rather than a code problem — and in this repository it is almost always the
Root Directory pair above.
