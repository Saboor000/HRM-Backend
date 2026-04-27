import PDFDocument from "pdfkit";

const money = (value) => Number(value || 0).toFixed(2);
const textOrDash = (value) => value || "-";

const line = (doc, label, value) => {
  doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
  doc.font("Helvetica").text(value ?? "-");
};

const componentLine = (doc, component) => {
  const percentageValue = component.rate ?? component.applicable_rate ?? component.value;
  const type =
    component.type === "percentage"
      ? `${percentageValue ?? 0}%`
      : component.type === "slab"
        ? "slab"
        : money(component.value);
  const amount = money(component.amount ?? component.value ?? 0);
  doc.font("Helvetica").text(`- ${component.name || "Component"} (${component.type || "fixed"}: ${type}) = ${amount}`);
};

export const generatePayslipPdf = (payload, res) => {
  const payroll = payload.payroll || payload;
  const employee = payroll.employee || {};
  const employeeName = `${employee.first_name || ""} ${employee.last_name || ""}`.trim();

  const components = payroll.components || {};
  const earnings = payroll.earnings_breakdown || {};
  const deductions = payroll.deductions_breakdown || {};
  const summary = payroll.summary_snapshot || {};
  const attendance = payroll.attendance || {};
  const period = payroll.period || payroll.period_snapshot || {};
  const totalsSource = payroll.totals || {};
  const totalWorkingDays = Number(
    period.working_days || summary.total_days || payroll.total_days || 0
  );
  const derivedPerDaySalary = totalWorkingDays > 0
    ? Number((totalsSource.basic_salary ?? payroll.basic_salary) || 0) / totalWorkingDays
    : 0;

  const payableBonuses = ((components.bonuses || earnings.bonuses) || [])
    .filter((component) => Number(component.amount || 0) > 0);

  const attendanceValue = (compactKey, summaryKey, payrollKey) =>
    attendance[compactKey] ?? summary[summaryKey] ?? payroll[payrollKey] ?? "-";
  const totals = {
    prorated_basic_salary: totalsSource.basic_salary ?? payroll.basic_salary,
    basic_salary: totalsSource.basic_salary ?? payroll.basic_salary,
    per_day_salary: totalsSource.per_day_salary ?? payroll.per_day_salary ?? derivedPerDaySalary,
    allowances_total: totalsSource.allowances_total ?? payroll.allowances_total,
    bonuses_total: totalsSource.bonuses_total ?? payroll.bonuses_total,
    overtime_amount: totalsSource.total_overtime_amount ?? payroll.overtime_amount,
    gross_salary: totalsSource.gross_salary ?? payroll.gross_salary,
    lop_deduction: payroll.lop_amount,
    deductions_total: totalsSource.deductions_total ?? payroll.deductions_total,
    net_salary: totalsSource.net_salary ?? payroll.net_salary,
  };

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename=payslip-${payroll.employee_id}-${payroll.month}-${payroll.year}.pdf`
  );
  doc.pipe(res);

  doc.fontSize(22).font("Helvetica-Bold").text("Payroll Payslip", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica").text(`Payroll ID: ${textOrDash(payroll.id)}`, { align: "center" });
  doc.text(`Status: ${textOrDash(payroll.status)}`, { align: "center" });
  doc.moveDown(1);

  doc.fontSize(13).font("Helvetica-Bold").text("Employee Details");
  doc.moveDown(0.25);
  line(doc, "Employee", textOrDash(employeeName));
  line(doc, "Employee ID", textOrDash(employee.id || payroll.employee_id));
  line(doc, "Designation", textOrDash(employee.designation));
  line(doc, "Department", textOrDash(employee.department));
  line(doc, "Month", `${payroll.month}/${payroll.year}`);
  line(doc, "Period", `${textOrDash(period.start_date)} to ${textOrDash(period.end_date)}`);

  doc.moveDown(0.8);
  doc.fontSize(13).font("Helvetica-Bold").text("Attendance Summary");
  doc.moveDown(0.25);
  line(doc, "Working Days", period.working_days ?? summary.total_days ?? "-");
  line(doc, "Present Days", attendanceValue("present_days", "present_days", "present_days"));
  line(doc, "Half Days", attendanceValue("half_days", "half_days", "half_days"));
  line(doc, "Paid Leave Days", attendanceValue("paid_leaves", "paid_leaves", "paid_leaves"));
  line(doc, "Unpaid Leave Days", attendanceValue("unpaid_leaves", "unpaid_leaves", "unpaid_leaves"));
  line(doc, "Payable Days", attendanceValue("payable_days", "payable_days", "payable_days"));
  if (attendance.proration_factor_percent !== undefined || summary.proration_factor_percent !== undefined) {
    line(doc, "Salary Proration", `${(attendance.proration_factor_percent ?? summary.proration_factor_percent ?? 0)}%`);
  }
  if (attendance.late_arrivals !== undefined || summary.late_arrivals !== undefined) {
    line(doc, "Late Arrivals", attendance.late_arrivals ?? summary.late_arrivals);
  }
  if (summary.late_penalty_days !== undefined) {
    line(doc, "Late Penalty Days", summary.late_penalty_days);
  }
  line(
    doc,
    "Overtime Hours",
    attendance.overtime_breakdown
      ? Number(attendance.overtime_breakdown.approved_hours || 0) + Number(attendance.overtime_breakdown.unapproved_hours || 0)
      : attendanceValue("overtime_hours", "overtime_hours", "overtime_hours")
  );

  doc.moveDown(0.8);
  doc.fontSize(13).font("Helvetica-Bold").text("Earnings Calculation");
  doc.moveDown(0.25);
  if (totals.prorated_basic_salary !== undefined) {
    doc.font("Helvetica-Bold").text(`Prorated Basic Salary: ${money(totals.prorated_basic_salary)}`, { indent: 10 });
    if ((attendance.proration_factor_percent ?? summary.proration_factor_percent) !== undefined
      && Number(attendance.proration_factor_percent ?? summary.proration_factor_percent) < 100) {
      doc.font("Helvetica").text(
        `× ${(attendance.proration_factor_percent ?? summary.proration_factor_percent ?? 0)}% (${(attendance.payable_days ?? summary.payable_days ?? 0)} payable / ${(period.working_days ?? summary.total_days ?? 0)} working days)`,
        { indent: 20 }
      );
    }
  }
  componentLine(doc, { name: "Basic Salary", type: "fixed", value: totals.basic_salary, amount: totals.basic_salary });
  for (const component of components.allowances || earnings.allowances || []) componentLine(doc, component);
  for (const component of payableBonuses) componentLine(doc, component);
  componentLine(
    doc,
    {
      name: "Overtime",
      type: "fixed",
      value: totals.overtime_amount,
      amount: totals.overtime_amount,
    }
  );

  doc.moveDown(0.8);
  doc.fontSize(13).font("Helvetica-Bold").text("Deductions");
  doc.moveDown(0.25);
  const deductionsList = components.deductions || deductions.items || [];
  for (const component of deductionsList) componentLine(doc, component);
  if (totals.lop_deduction > 0) {
    doc.font("Helvetica").text(`- Loss of Pay = ${money(totals.lop_deduction)}`);
  }

  doc.moveDown(0.8);
  doc.fontSize(13).font("Helvetica-Bold").text("Salary Totals");
  doc.moveDown(0.25);
  line(doc, "Gross Salary", money(totals.gross_salary));
  line(doc, "Total Deductions", money(totals.deductions_total));
  line(doc, "Net Salary", money(totals.net_salary));

  doc.moveDown(0.8);
  doc.fontSize(13).font("Helvetica-Bold").text("Monthly Salary Summary", { underline: true });
  doc.moveDown(0.25);
  doc.fontSize(11).font("Helvetica-Bold").text(`Total Salary for Month: ${money(totals.net_salary)}`, { align: "center" });
  const payableDaysForSummary = Number(attendance.payable_days ?? summary.payable_days ?? 0);
  const workingDaysForSummary = Number(period.working_days ?? summary.total_days ?? 0);
  if (payableDaysForSummary > 0 && workingDaysForSummary > 0) {
    const payableDays = payableDaysForSummary;
    const dailyRate = Number(totals.per_day_salary || 0);
    const dayLabel = payableDays === 1 ? "day" : "days";
    doc.fontSize(10).font("Helvetica").text(
      `(${money(dailyRate)} per working day × ${payableDays} payable ${dayLabel})`,
      { align: "center" }
    );
  }

  doc.moveDown(0.8);
  doc.fontSize(13).font("Helvetica-Bold").text("Leave Summary");
  doc.moveDown(0.25);
  line(doc, "Paid Leaves", attendanceValue("paid_leaves", "paid_leaves", "paid_leaves"));
  line(doc, "Unpaid Leaves", attendanceValue("unpaid_leaves", "unpaid_leaves", "unpaid_leaves"));
  line(doc, "Payable Days", attendanceValue("payable_days", "payable_days", "payable_days"));

  doc.moveDown(1);
  doc.fontSize(9).fillColor("#666666")
    .text("This payslip is generated from stored payroll snapshots and does not recalculate historical salary data.");
  doc.text("Salary is prorated based on payable days (present days + half-day units + paid leave days).");

  doc.end();
  return res;
};