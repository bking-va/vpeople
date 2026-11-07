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
