# Code Signing for Windows Releases

Unsigned Windows installers trigger SmartScreen warnings. For public releases, sign builds with an Authenticode certificate.

## Prerequisites

1. Purchase a code-signing certificate (EV recommended for immediate SmartScreen trust).
2. Export the certificate as a `.pfx` file or base64 string.

## GitHub Secrets

Add these repository secrets:

| Secret | Description |
|--------|-------------|
| `CSC_LINK` | Base64-encoded `.pfx` or HTTPS URL to the certificate |
| `CSC_KEY_PASSWORD` | Password for the `.pfx` file |

## Signed Release Workflow

1. Open **Actions → Release → Run workflow**.
2. Set tag (e.g. `v0.1.3`).
3. Enable **Sign Windows builds**.
4. Run workflow.

The release job passes `CSC_LINK` and `CSC_KEY_PASSWORD` to `electron-builder` only when signing is enabled. Unsigned tag pushes omit signing env vars to avoid empty-secret failures.

## Local Signing

```bash
export CSC_LINK=/path/to/cert.pfx
export CSC_KEY_PASSWORD=your-password
npm run dist
```

## Verification

After download, check the installer signature:

```powershell
Get-AuthenticodeSignature "Grand Strategy Setup 0.1.2.exe"
```

Status should be `Valid` for signed builds.
