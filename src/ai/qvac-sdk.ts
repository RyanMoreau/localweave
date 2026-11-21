/**
 * Lazily loads QVAC so dispatcher-only peers and deterministic tests do not
 * initialize native inference workers. All other modules use this boundary.
 */
let sdk: Promise<typeof import('@qvac/sdk')> | undefined

export function qvacSdk() {
  const packageName = '@qvac/sdk'
  sdk ??= import(packageName)
  return sdk
}
