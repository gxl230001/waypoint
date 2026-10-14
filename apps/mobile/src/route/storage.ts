import { Directory, File, Paths } from "expo-file-system";
import type { Leg, Route, SaveRouteResult } from "./types";

const DIR_NAME = "routes";
const MAX_ID_ATTEMPTS = 20;

function routesDir(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isLeg(value: unknown): value is Leg {
  const l = value as Partial<Leg> | null;
  return (
    !!l &&
    typeof l.steps === "number" &&
    typeof l.headingDeg === "number" &&
    (l.turnAfterDeg === null || typeof l.turnAfterDeg === "number") &&
    (l.label === undefined || typeof l.label === "string")
  );
}

export function isRoute(value: unknown): value is Route {
  const r = value as Partial<Route> | null;
  return (
    !!r &&
    r.version === 1 &&
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.createdAt === "string" &&
    typeof r.totalSteps === "number" &&
    Array.isArray(r.legs) &&
    r.legs.every(isLeg) &&
    (r.notes === undefined || typeof r.notes === "string")
  );
}

/**
 * Finds an unused route id so that existing files are never overwritten.
 */
function uniqueRouteId(dir: Directory, preferred: string): string {
  const taken = (id: string) =>
    new File(dir, `${id}.json`).exists ||
    new File(dir, `${id}.json.part`).exists;

  if (!taken(preferred)) return preferred;
  for (let i = 2; i < MAX_ID_ATTEMPTS + 2; i++) {
    const candidate = `${preferred}_${i}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error("Could not find an unused route file name.");
}

/**
 * Saves a route JSON file to Paths.document/routes/<id>.json.
 * Uses atomic .part staging and never overwrites an existing file.
 */
export function saveRoute(route: Route): SaveRouteResult {
  const created: File[] = [];
  try {
    const dir = routesDir();
    const id = uniqueRouteId(dir, route.id);
    const finalRoute: Route = { ...route, id };

    const json = JSON.stringify(finalRoute, null, 2);

    const part = new File(dir, `${id}.json.part`);
    created.push(part);
    part.create({ overwrite: false });
    part.write(json);

    if (!part.exists || part.size === 0) {
      throw new Error("Write verification failed (file is empty).");
    }

    const targetFile = new File(dir, `${id}.json`);
    part.moveSync(targetFile, { overwrite: false });
    created.length = 0;

    return { ok: true, route: finalRoute };
  } catch (e) {
    for (const f of created) {
      try {
        if (f.exists) f.delete();
      } catch {
        /* ignore rollback cleanup error */
      }
    }
    return { ok: false, error: errorText(e) };
  }
}

/**
 * Lists all saved routes from the document directory, sorted newest first.
 */
export function listRoutes(): { items: Route[]; unreadable: number } {
  const dir = routesDir();
  const items: Route[] = [];
  let unreadable = 0;

  for (const entry of dir.list()) {
    if (
      !(entry instanceof File) ||
      !entry.name.endsWith(".json") ||
      entry.name.endsWith(".json.part")
    ) {
      continue;
    }

    try {
      const data: unknown = JSON.parse(entry.textSync());
      if (!isRoute(data)) {
        throw new Error("Invalid route format");
      }
      items.push(data);
    } catch {
      unreadable += 1;
    }
  }

  items.sort((a, b) => {
    const tA = Date.parse(a.createdAt) || 0;
    const tB = Date.parse(b.createdAt) || 0;
    return tB - tA;
  });

  return { items, unreadable };
}

/**
 * Loads a single route by its id.
 */
export function loadRoute(id: string): Route | null {
  const dir = routesDir();
  const file = new File(dir, `${id}.json`);
  if (!file.exists) return null;

  try {
    const data: unknown = JSON.parse(file.textSync());
    if (isRoute(data)) return data;
  } catch {
    return null;
  }
  return null;
}
