import { BambooHrClient, BambooHrHttpError } from "./client";
import {
  BAMBOO_COMPENSATION_TABLES,
  mapCompensationTableRow,
  type BambooCompensationTableAlias,
  type MappedCompensationTableRowWrite,
} from "./map-comp-tables";
import type { BambooSyncStore } from "./sync";
import type { BatchProgress } from "./chunks";
import type { BambooSyncMode } from "./types";

export type CompensationTablesFetchPayload = {
  tables: Record<string, Record<string, Array<Record<string, unknown>>>>;
};

export function emptyCompensationTablesPayload(): CompensationTablesFetchPayload {
  return { tables: {} };
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

export async function fetchCompensationTablesPayload(
  client: BambooHrClient,
  log: (message: string) => void
): Promise<CompensationTablesFetchPayload> {
  const tables: CompensationTablesFetchPayload["tables"] = {};
  for (const { alias } of BAMBOO_COMPENSATION_TABLES) {
    client.allowFullTable(alias);
    log(`Phase fetch: compensation table ${alias}`);
    const rows = await fetchOptionalTable(client, alias);
    tables[alias] = rows ?? {};
    log(
      `compensation table ${alias} employees ${Object.keys(tables[alias]).length}`
    );
  }
  return { tables };
}

export function mapCompensationTablesPayload(
  payload: CompensationTablesFetchPayload
): MappedCompensationTableRowWrite[] {
  const mapped: MappedCompensationTableRowWrite[] = [];
  for (const { alias } of BAMBOO_COMPENSATION_TABLES) {
    const employees = payload.tables[alias] ?? {};
    for (const [employeeBambooId, rows] of Object.entries(employees)) {
      for (const row of rows) {
        const item = mapCompensationTableRow(
          row,
          employeeBambooId,
          alias as BambooCompensationTableAlias
        );
        if (item) mapped.push(item);
      }
    }
  }
  return mapped;
}

export async function writeCompensationTablesPayload(
  store: BambooSyncStore,
  payload: CompensationTablesFetchPayload,
  idByBambooId: Map<string, number>,
  mode: BambooSyncMode,
  progress: (label: string) => BatchProgress,
  log: (message: string) => void
): Promise<number> {
  const mapped = mapCompensationTablesPayload(payload);
  const rows = mapped.flatMap((row) => {
    const employeeId = idByBambooId.get(row.employeeBambooId);
    if (employeeId == null) return [];
    return [
      {
        bambooId: row.bambooId,
        employeeId,
        tableAlias: row.tableAlias,
        rowData: row.rowData,
      },
    ];
  });
  log(`Phase write: employee_compensation_table_rows ${rows.length}`);
  const written = await store.upsertCompensationTableRowsBatch(
    rows,
    progress("employee_compensation_table_rows")
  );
  if (mode === "full") {
    await store.pruneImportedRowsNotIn(
      "compensation_tables",
      rows.map((row) => row.bambooId),
      progress("prune compensation_tables")
    );
  }
  return written;
}
