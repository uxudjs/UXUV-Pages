# App update clipboard fallback focus

Date: 2026-08-13

## Observed behavior

When `navigator.clipboard.writeText` rejected and the controlled textarea fallback copied successfully, the update dialog reported success but keyboard focus moved away from the “Copy latest `_worker.js`” button.

RED reproduction:

```powershell
npx playwright test work-products/tests/app-update-control.e2e.spec.ts --grep "restores focus"
```

Result before the fix: `1 failed`; `expect(copyButton).toBeFocused()` received an inactive button.

## Root cause

`../../components/AppUpdateControl.tsx` applied native `disabled` while the copy request was in progress, so the focused copy button lost focus before the fallback ran. The fallback also removed its temporary textarea outside `finally`, so a thrown `execCommand` could skip cleanup.

## Fix

- Keep the in-progress button focusable, expose `aria-disabled`, and guard duplicate copy actions in the handler.
- Capture the active element before selecting the temporary textarea.
- Remove the textarea and restore the connected element with `focus({ preventScroll: true })` in `finally`.
- Add the browser regression in `../tests/app-update-control.e2e.spec.ts`.

The focus APIs follow the platform behavior documented by MDN:

- https://developer.mozilla.org/en-US/docs/Web/API/Document/activeElement
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus

The existing `execCommand("copy")` fallback remains intentionally bounded because the approved product contract requires a fallback; the Clipboard API remains the primary path.

## Verification

- Targeted RED before source change: `1 failed`.
- Targeted GREEN after source change: `1 passed`.
- `npm test`: `139/139` passed.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run test:e2e`: `111/111` passed.

## Remaining boundary

This local browser proof does not verify a Cloudflare deployment or change the separate release blocker that GitHub `main` still serves Worker `1.0.0`. No commit, push, Pages publication, or Worker deployment was performed.
