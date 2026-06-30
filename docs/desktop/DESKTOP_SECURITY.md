# MailMind Desktop Security

## Electron Security Configuration

The desktop shell follows Electron security best practices:

| Setting | Value | Reason |
|---|---|---|
| `contextIsolation` | `true` | Prevents renderer from accessing Node APIs |
| `nodeIntegration` | `false` | No Node.js in renderer process |
| `webSecurity` | `true` | Enforces same-origin policy |
| `sandbox` | `true` | Process-level sandboxing (when compatible) |

## Preload API Surface

The preload script exposes a minimal API via `contextBridge`:

```typescript
window.electronAPI = {
  getAppInfo()     // { name, version, platform }
  getConfig()      // { appUrl, healthUrl }
  retryConnection() // Re-trigger health check
  openExternal(url) // Open URL in system browser
}
```

No Node.js modules, file system access, or shell access is exposed to the renderer.

## External Link Policy

- `https:` / `http:` links → open in system browser
- `mailto:` links → open in system mail client
- Navigation to untrusted URLs within the Electron window is blocked
- `will-navigate` and `new-window` events enforce this policy

## No Secrets in Renderer

The desktop shell does not expose, transmit, or store:

- API keys
- OAuth tokens
- Session cookies
- Encryption keys
- Database credentials

All authentication is handled by the backend server. The Electron shell only loads a web page.

## No Loading of Untrusted URLs

The app only loads:

1. The configured `APP_URL` (default `http://127.0.0.1:3000`)
2. The local `fallback.html` (when services are unavailable)

It does not load arbitrary remote URLs, CDN content, or user-provided URLs in the main window.
