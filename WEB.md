# Browser web app

Runnable browser build of this industrial-design workbench. Login uses the LIHUO / TESTER license catalog in this repo (built-in codes, `apps/web/data/licenses.json`, and environment variables). It does not use the tablet product.

API keys stay in the browser (`localStorage` on the settings page). Do not commit customer API keys or extra license secrets.

## Install

From the repository root (Node.js 20 or 22):

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

## Log in

After the splash screen, enter a LIHUO or TESTER code. Dashes and spaces are ignored, so `LIHUO88888888` and `LIHUO-88888888` are the same code.

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
2. Open http://localhost:3001 and wait for the splash screen to finish.
3. Enter `LIHUO88888888` and choose 验证并进入. The code is accepted. A dashed form such as `LIHUO-88888888` is also accepted.
4. Open 设置, paste your own provider API key, and return to 新建生成.
5. Upload a product image and run 外观重构, 套图/详情, or 局部改款. The key remains in this browser only.

Optional API check:

```bash
curl -s -X POST http://localhost:3001/api/license/verify \
  -H 'content-type: application/json' \
  -d '{"licenseCode":"LIHUO88888888","deviceId":"browser-check-1"}'
```

A successful response has `"valid": true`.
