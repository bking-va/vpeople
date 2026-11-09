export function formatGender(gender: string | null | undefined): string {
  const map: Record<string, string> = {
    male: "Male",
    female: "Female",
    non_binary: "Non-binary",
    prefer_not_to_say: "Prefer not to say",
    other: "Other",
    unspecified: "Unspecified",
  };
  if (!gender) return "Unspecified";
  if (map[gender]) return map[gender];
  return gender
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatEmploymentStatus(
  status: "full_time" | "part_time" | "contractor" | "on_leave" | "terminated"
): string {
  const map: Record<string, string> = {
    full_time: "Full-Time",
    part_time: "Part-Time",
    contractor: "Contractor",
    on_leave: "On Leave",
    terminated: "Terminated",
  };
  return map[status] || status;
}
