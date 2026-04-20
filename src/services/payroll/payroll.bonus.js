export const isBonusEligible = (component, context) => {
  const rules = component?.eligibility || {};
  const ratioThresholdRaw = rules.min_payable_ratio;
  const ratioThreshold =
    ratioThresholdRaw === undefined || ratioThresholdRaw === null
      ? null
      : Number(ratioThresholdRaw) > 1
        ? Number(ratioThresholdRaw) / 100
        : Number(ratioThresholdRaw);

  if (component?.is_bonus_eligible === false) {
    return { eligible: false, reason: "is_bonus_eligible=false" };
  }

  if (rules.require_full_attendance && context.unpaidLeaves > 0) {
    return { eligible: false, reason: "require_full_attendance" };
  }

  if (rules.min_present_days !== undefined && context.presentDays < Number(rules.min_present_days)) {
    return { eligible: false, reason: "min_present_days_not_met" };
  }

  if (rules.min_payable_days !== undefined && context.payableDays < Number(rules.min_payable_days)) {
    return { eligible: false, reason: "min_payable_days_not_met" };
  }

  if (ratioThreshold !== null && context.payableRatio < ratioThreshold) {
    return { eligible: false, reason: "min_payable_ratio_not_met" };
  }

  if (rules.max_unpaid_leave_days !== undefined && context.unpaidLeaves > Number(rules.max_unpaid_leave_days)) {
    return { eligible: false, reason: "max_unpaid_leave_days_exceeded" };
  }

  return { eligible: true, reason: null };
};
