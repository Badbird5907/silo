const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const FILES_DASHBOARD_DAYS = 7;

export function getFilesDashboardDateRange() {
  const end = new Date();
  const start = new Date(end.getTime() - FILES_DASHBOARD_DAYS * MS_PER_DAY);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
