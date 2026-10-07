/**
 * The `nyuchi-*` → `mzizi-*` component renames (2026-09-27). mzizi-registry's
 * next.config.mjs answers these with a 308 per prefix; the map is its
 * lib/component-renames.json, bundled into src/data/meta.json.
 */
import { renames } from "./data";

/**
 * Prefixes whose next segment is a registry item name — the API-host subset of
 * `COMPONENT_PATH_PREFIXES` in mzizi-registry lib/component-renames.ts. The
 * site-only prefixes (/components, /source, …) are not served on this host.
 */
const COMPONENT_PATH_PREFIXES = [
  "/api/v1/ui",
  "/api/v1/rs",
  "/api/v1/py",
  "/api/health",
  "/api/chaos",
  "/v1/ui",
  "/v1/rs",
  "/v1/py",
];

/** `/v1/ui/nyuchi-footer/docs` → `/v1/ui/mzizi-footer/docs`, or null. */
export function renamedComponentPath(pathname: string): string | null {
  for (const prefix of COMPONENT_PATH_PREFIXES) {
    if (!pathname.startsWith(prefix + "/")) continue;
    const rest = pathname.slice(prefix.length + 1);
    const slash = rest.indexOf("/");
    const segment = slash === -1 ? rest : rest.slice(0, slash);
    if (!Object.prototype.hasOwnProperty.call(renames, segment)) return null;
    return `${prefix}/${renames[segment]}${slash === -1 ? "" : rest.slice(slash)}`;
  }
  return null;
}
