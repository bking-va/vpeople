import { BambooHrClient, BambooHrHttpError } from "./client";
import {
  emptyMetadataCounts,
  mapAssetRow,
  mapCustomFieldValue,
  mapDependentRow,
  mapEmployeeExtras,
  mapMetaField,
  type MappedAssetWrite,
  type MappedCustomFieldValueWrite,
  type MappedCustomFieldWrite,
  type MappedDependentWrite,
  type MappedEmployeeExtrasWrite,
  type MetadataDatasetCounts,
} from "./map-metadata";
import type { BambooSyncStore } from "./sync";
import type { BatchProgress } from "./chunks";
import type { BambooSyncMode } from "./types";

const CUSTOM_REPORT_FIELD_CHUNK = 40;

export type MetadataFetchPayload = {
  metaFields: unknown[];
  employeeExtras: Array<Record<string, unknown>>;
  customValues: Array<Record<string, unknown>>;
  customValueAliasesFetched: string[];
  assets: Record<string, Array<Record<string, unknown>>>;
  dependents: Record<string, Array<Record<string, unknown>>>;
  assetsFetched: boolean;
  dependentsFetched: boolean;
};

export function emptyMetadataPayload(): MetadataFetchPayload {
  return {
    metaFields: [],
    employeeExtras: [],
    customValues: [],
    customValueAliasesFetched: [],
    assets: {},
    dependents: {},
    assetsFetched: false,
    dependentsFetched: false,
  };
}

async function fetchOptionalTable(
  client: BambooHrClient,
  table: string
): Promise<Record<string, Array<Record<string, unknown>>> | null> {
  try {
    return await client.fetchAllTableRows(table);
  } catch (error) {
    if (error instanceof BambooHrHttpError && error.status === 404) return null;
    throw error;
  }
}

function mergeTableRows(
  into: Record<string, Array<Record<string, unknown>>>,
  extra: Record<string, Array<Record<string, unknown>>>
) {
  for (const [bambooId, rows] of Object.entries(extra)) {
    into[bambooId] = (into[bambooId] || []).concat(rows);
  }
}

async function resolveTableAliases(
  client: BambooHrClient,
  kind: "assets" | "dependents"
): Promise<string[]> {
  const fallback =
    kind === "assets"
      ? ["employeeAssets", "assets"]
      : ["dependents", "employeeDependents"];
  const match = (alias: string) => {
    const lower = alias.toLowerCase();
    if (/ssn|sin|bank|iban|routing|credit/.test(lower)) return false;
    return kind === "assets"
      ? /asset/.test(lower)
      : /dependent/.test(lower);
  };
  try {
    const tables = await client.fetchMetaTables();
    const matched = tables.filter(match);
    const names = matched.length > 0 ? matched : fallback;
    for (const name of names) client.allowFullTable(name);
    return names;
  } catch (error) {
    if (error instanceof BambooHrHttpError && error.status === 404) {
      for (const name of fallback) client.allowFullTable(name);
      return fallback;
    }
    throw error;
  }
}

export async function fetchMetadataPayload(
  client: BambooHrClient,
  log: (message: string) => void
): Promise<MetadataFetchPayload> {
  log("Phase fetch: meta fields");
  const metaFields = await client.fetchMetaFields().catch((error) => {
    if (error instanceof BambooHrHttpError && error.status === 404) return [];
    throw error;
  });
  log(`meta fields fetched ${metaFields.length}`);

  const mappedFields = metaFields
    .map((row) => mapMetaField(row))
    .filter((row): row is MappedCustomFieldWrite => Boolean(row));
  const aliases = mappedFields.map((field) => field.bambooId);

  log("Phase fetch: employee extras + custom field values");
  const employeeExtras = await client
    .fetchCustomReport({
      title: "vPeople employee extras",
      fields: ["id", "ethnicity", "eeo", "payGroup", "exempt", "standardHoursPerWeek", "timeTrackingEnabled"],
    })
    .catch((error) => {
      if (error instanceof BambooHrHttpError && error.status === 404) return [];
      throw error;
    });

  const customValues: Array<Record<string, unknown>> = [];
  const customValueAliasesFetched: string[] = [];
  for (let i = 0; i < aliases.length; i += CUSTOM_REPORT_FIELD_CHUNK) {
    const chunk = aliases.slice(i, i + CUSTOM_REPORT_FIELD_CHUNK);
    const rows = await client
      .fetchCustomReport({
        title: "vPeople custom fields",
        fields: ["id", ...chunk],
      })
      .catch((error) => {
        if (error instanceof BambooHrHttpError && (error.status === 400 || error.status === 404)) {
          return null;
        }
        throw error;
      });
    if (!rows) continue;
    customValues.push(...rows);
    const returnedKeys = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      for (const key of Object.keys(row)) returnedKeys.add(key);
    }
    // Bamboo can 200 a custom report while omitting fields the API key cannot
    // read. Only prune aliases that actually came back as keys.
    for (const alias of chunk) {
      if (returnedKeys.has(alias)) customValueAliasesFetched.push(alias);
    }
    log(`custom field value chunks ${Math.min(i + chunk.length, aliases.length)}/${aliases.length}`);
  }

  log("Phase fetch: assets");
  const assets: Record<string, Array<Record<string, unknown>>> = {};
  let assetsFetched = false;
  for (const table of await resolveTableAliases(client, "assets")) {
    const rows = await fetchOptionalTable(client, table);
    if (rows) {
      assetsFetched = true;
      mergeTableRows(assets, rows);
    }
  }
  log(`assets employees ${Object.keys(assets).length}`);

  log("Phase fetch: dependents");
  const dependents: Record<string, Array<Record<string, unknown>>> = {};
  let dependentsFetched = false;
  for (const table of await resolveTableAliases(client, "dependents")) {
    const rows = await fetchOptionalTable(client, table);
    if (rows) {
      dependentsFetched = true;
      mergeTableRows(dependents, rows);
    }
  }
  log(`dependents employees ${Object.keys(dependents).length}`);

  return {
    metaFields,
    employeeExtras,
    customValues,
    customValueAliasesFetched,
    assets,
    dependents,
    assetsFetched,
    dependentsFetched,
  };
}

export function mapMetadataPayload(payload: MetadataFetchPayload): {
  extras: MappedEmployeeExtrasWrite[];
  assets: MappedAssetWrite[];
  dependents: MappedDependentWrite[];
  customFields: MappedCustomFieldWrite[];
  customFieldValues: MappedCustomFieldValueWrite[];
} {
  const extras = payload.employeeExtras
    .map((row) => mapEmployeeExtras(row))
    .filter((row): row is MappedEmployeeExtrasWrite => Boolean(row));
  const assets: MappedAssetWrite[] = [];
  for (const [employeeBambooId, rows] of Object.entries(payload.assets)) {
    for (const row of rows) {
      const mapped = mapAssetRow(row, employeeBambooId);
      if (mapped) assets.push(mapped);
    }
  }
  const dependents: MappedDependentWrite[] = [];
  for (const [employeeBambooId, rows] of Object.entries(payload.dependents)) {
    for (const row of rows) {
      const mapped = mapDependentRow(row, employeeBambooId);
      if (mapped) dependents.push(mapped);
    }
  }
  const customFieldsByAlias = new Map<string, MappedCustomFieldWrite>();
  for (const row of payload.metaFields) {
    const mapped = mapMetaField(row);
    if (!mapped) continue;
    customFieldsByAlias.set(mapped.bambooId, mapped);
  }
  const customFields = [...customFieldsByAlias.values()];
  const fieldsByAlias = customFieldsByAlias;
  const customFieldValues: MappedCustomFieldValueWrite[] = [];
  for (const row of payload.customValues) {
    for (const field of fieldsByAlias.values()) {
      const mapped = mapCustomFieldValue(row, field);
      if (mapped) customFieldValues.push(mapped);
    }
  }
  return { extras, assets, dependents, customFields, customFieldValues };
}

export async function writeMetadataPayload(
  store: BambooSyncStore,
  payload: MetadataFetchPayload,
  idByBambooId: Map<string, number>,
  mode: BambooSyncMode,
  progress: (label: string) => BatchProgress,
  log: (message: string) => void
): Promise<MetadataDatasetCounts> {
  const mapped = mapMetadataPayload(payload);
  log("Phase write: employee extras");
  const employeeExtras = await store.updateEmployeeExtrasBatch(
    mapped.extras.filter((row) => idByBambooId.has(row.bambooId)),
    progress("employee extras")
  );

  log("Phase write: custom fields");
  const fieldIds = await store.upsertCustomFieldsBatch(
    mapped.customFields,
    progress("custom_fields")
  );

  const valueRows = mapped.customFieldValues.flatMap((row) => {
    const employeeId = idByBambooId.get(row.employeeBambooId);
    const customFieldId = fieldIds.get(row.fieldBambooId);
    if (employeeId == null || customFieldId == null) return [];
    return [{ customFieldId, entityId: employeeId, value: row.value }];
  });
  log("Phase write: custom field values");
  const customFieldValues = await store.upsertCustomFieldValuesBatch(
    valueRows,
    progress("custom_field_values")
  );
  const fetchedAliases = payload.customValueAliasesFetched ?? [];
  if (fetchedAliases.length > 0) {
    const fetchedFieldIds = fetchedAliases.flatMap((alias) => {
      const id = fieldIds.get(alias);
      return id == null ? [] : [id];
    });
    await store.pruneImportedCustomFieldValues(
      valueRows,
      fetchedFieldIds,
      progress("prune custom_field_values")
    );
  }

  const assetRows = mapped.assets.flatMap((row) => {
    const employeeId = idByBambooId.get(row.employeeBambooId);
    if (employeeId == null) return [];
    return [{ ...row, employeeId }];
  });
  log("Phase write: employee_assets");
  const assets = await store.upsertAssetsBatch(assetRows, progress("employee_assets"));

  const dependentRows = mapped.dependents.flatMap((row) => {
    const employeeId = idByBambooId.get(row.employeeBambooId);
    if (employeeId == null) return [];
    return [{ ...row, employeeId }];
  });
  log("Phase write: employee_dependents");
  const dependents = await store.upsertDependentsBatch(
    dependentRows,
    progress("employee_dependents")
  );

  if (payload.assetsFetched) {
    await store.pruneImportedRowsNotIn(
      "assets",
      assetRows.map((row) => row.bambooId),
      progress("prune assets")
    );
  }
  if (payload.dependentsFetched) {
    await store.pruneImportedRowsNotIn(
      "dependents",
      dependentRows.map((row) => row.bambooId),
      progress("prune dependents")
    );
  }

  return {
    assets,
    dependents,
    customFields: mapped.customFields.length,
    customFieldValues,
    employeeExtras,
  };
}

export { emptyMetadataCounts };
