export const PUBLIC_CAREER_OPENING_FIELDS = [
  "id",
  "title",
  "employmentType",
  "description",
  "requirements",
  "openDate",
  "departmentName",
  "locationName",
] as const;

export type PublicCareerOpening = {
  id: number;
  title: string;
  employmentType: string;
  description: string | null;
  requirements: string | null;
  openDate: string | null;
  departmentName: string | null;
  locationName: string | null;
};

export type CareerOpeningSource = {
  id: number;
  title: string;
  employmentType: string;
  description?: string | null;
  requirements?: string | null;
  openDate?: string | Date | null;
  departmentName?: string | null;
  locationName?: string | null;
};

export function toPublicCareerOpening(row: CareerOpeningSource): PublicCareerOpening {
  const openDate =
    row.openDate instanceof Date
      ? row.openDate.toISOString().slice(0, 10)
      : row.openDate ?? null;
  return {
    id: row.id,
    title: row.title,
    employmentType: row.employmentType,
    description: row.description ?? null,
    requirements: row.requirements ?? null,
    openDate,
    departmentName: row.departmentName ?? null,
    locationName: row.locationName ?? null,
  };
}
