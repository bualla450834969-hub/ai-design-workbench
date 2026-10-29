# Browser web app

Runnable browser build of the industrial-design tablet workbench. The home page follows the tablet layout: activate, connect your own model API key, create a project, then generate. IDAI1 codes are checked on this machine from the local allowlist. LIHUO / TESTER codes still use the catalog in this repo. The page does not call a remote license server.

API keys stay in the browser (`localStorage` on the settings page). Do not commit customer API keys or extra license secrets.

## Install

From the repository root (Node.js 24.x):

```bash
npm install
```

## Development

```bash
npm run dev
```

Open http://localhost:3001

`npm run web:dev` is the same command.

## Production

```bash
npm run build
npm run start
```

Open http://localhost:3001

`npm run web:build` and `npm run web:start` are the same commands. These scripts start Next.js only. Electron packaging stays under `apps/web` (`electron:dev`, `electron:build`) and is not required for the browser.

## Activate

After the short loading screen, paste an IDAI1 code you already own, or a LIHUO / TESTER code. IDAI1 tokens are case-sensitive. Spaces and line breaks are ignored. A dashed LIHUO code such as `LIHUO-88888888` is still the same as `LIHUO88888888`.

Windows setup for `D:\ai-tablet-web` is in [docs/tablet-windows.md](docs/tablet-windows.md).

Set `TABLET_ALLOW_TEST_CODE=1` in `apps/web/.env.local` and restart to accept the local test code `LOCAL-TABLET`. Leave it unset for normal use.

| Code | Behavior |
| --- | --- |
| `LIHUO88888888` | Built-in admin code, up to 3 devices |
| `TESTER88888888` | Built-in tester code, unlimited devices |
| `LIHUO` + digits in `apps/web/data/licenses.json` | Issued codes from this repo |

Add codes without editing source. Put them in `apps/web/.env.local`:

```bash
LICENSE_CODES=LIHUO123456,LIHUO654321
UNLIMITED_LICENSE_CODES=TESTER11111111
TESTER_LICENSE_CODES=TESTER22222222
```

Restart the server after changing env vars.

## Verify `LIHUO88888888`

1. `npm install` at the repo root, then `npm run dev`.
2. Open http://localhost:3001 and wait for the loading screen to finish.
3. Paste `LIHUO88888888` and choose 激活并继续. The code is accepted. A dashed form such as `LIHUO-88888888` is also accepted. An allowlisted `IDAI1...` code is accepted the same way.
4. On the model step, paste your own provider API key, or choose 稍后在设置中填写. Create a project to enter the workbench.
5. Upload a product image and run 外观改款, 场景图, or 局部精修. The key remains in this browser only.

Optional API check:

```bash
curl -s -X POST http://localhost:3001/api/license/verify \
  -H 'content-type: application/json' \
  -d '{"licenseCode":"LIHUO88888888","deviceId":"browser-check-1"}'
```

A successful response has `"valid": true`.
