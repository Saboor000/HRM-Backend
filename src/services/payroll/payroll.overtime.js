import { round2 } from "./payroll.utils.js";

export const applyOvertimeConstraints = (overtimeRows, overtimeRules = {}) => {
  const minPerDay = Number(overtimeRules.min_hours_per_day ?? 2);
  const maxPerDay = Number(overtimeRules.max_hours_per_day ?? 4);
  const maxPerMonth = Number(overtimeRules.max_hours_per_month ?? 20);

  const byDate = new Map();
  for (const row of overtimeRows || []) {
    const day = row.date;
    byDate.set(day, (byDate.get(day) || 0) + Number(row.hours || 0));
  }

  const violations = [];
  let monthlyTotal = 0;
  for (const [day, rawHours] of byDate.entries()) {
    let acceptedHours = rawHours;

    if (rawHours < minPerDay) {
      acceptedHours = 0;
      violations.push({ day, type: "below_daily_min", raw_hours: round2(rawHours), accepted_hours: 0 });
    } else if (rawHours > maxPerDay) {
      acceptedHours = maxPerDay;
      violations.push({ day, type: "above_daily_max", raw_hours: round2(rawHours), accepted_hours: round2(acceptedHours) });
    }

    byDate.set(day, round2(acceptedHours));
    monthlyTotal += acceptedHours;
  }

  monthlyTotal = round2(monthlyTotal);
  if (monthlyTotal > maxPerMonth) {
    const overflow = round2(monthlyTotal - maxPerMonth);
    let remainingOverflow = overflow;

    const datesDesc = [...byDate.keys()].sort((a, b) => String(b).localeCompare(String(a)));
    for (const day of datesDesc) {
      if (remainingOverflow <= 0) break;
      const current = Number(byDate.get(day) || 0);
      if (current <= 0) continue;
      const reduced = Math.max(0, round2(current - remainingOverflow));
      const used = round2(current - reduced);
      byDate.set(day, reduced);
      remainingOverflow = round2(Math.max(0, remainingOverflow - used));
    }

    monthlyTotal = maxPerMonth;
    violations.push({
      type: "above_monthly_cap",
      raw_monthly_hours: round2(monthlyTotal + overflow),
      accepted_monthly_hours: round2(monthlyTotal),
      reduced_hours: overflow,
    });
  }

  return {
    accepted_hours: round2(monthlyTotal),
    by_date: Object.fromEntries(byDate.entries()),
    violations,
    policy: {
      min_hours_per_day: minPerDay,
      max_hours_per_day: maxPerDay,
      max_hours_per_month: maxPerMonth,
    },
  };
};
