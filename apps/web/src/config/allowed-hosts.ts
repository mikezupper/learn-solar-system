/**
 * Reads ALLOWED_HOSTS from the environment: the names, besides localhost, that the dev and preview
 * servers answer to. Vite refuses all others, which stops a malicious site from reading the dev
 * server through DNS rebinding. Real hostnames stay in `.env`, which git ignores.
 */
export const parseAllowedHosts = (value: string | undefined): ReadonlyArray<string> =>
  (value ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0)
