import { round2 } from "./payroll.utils.js";
export const DEFAULT_MONTHLY_TAX_SLABS = [
    { up_to: 50000, rate: 0 },
    { up_to: 100000, rate: 5 },
    { up_to: 200000, rate: 10 },
    { up_to: null, rate: 15 },
];
export const isTaxComponent = (component) => {
    const name = String(component?.name || "").toLowerCase();
    return name.includes("tax") || Array.isArray(component?.tax_slabs) || component?.tax_mode === "slab";
};
export const normalizeTaxSlabs = (slabs = []) => {
    const normalized = (slabs || [])
        .map((slab) => ({
        up_to: slab?.up_to === null || slab?.up_to === undefined || slab?.up_to === ""
            ? null
            : Number(slab.up_to),
        rate: Number(slab?.rate || 0),
    }))
        .filter((slab) => slab.up_to === null || Number.isFinite(slab.up_to))
        .sort((a, b) => {
        if (a.up_to === null)
            return 1;
        if (b.up_to === null)
            return -1;
        return a.up_to - b.up_to;
    });
    return normalized.length ? normalized : DEFAULT_MONTHLY_TAX_SLABS;
};
export const calculateSlabTax = (taxableAmount, slabs) => {
    let remaining = Math.max(0, Number(taxableAmount || 0));
    let previousUpperBound = 0;
    let totalTax = 0;
    for (const slab of normalizeTaxSlabs(slabs)) {
        if (remaining <= 0)
            break;
        const upperBound = slab.up_to === null ? Number.POSITIVE_INFINITY : Number(slab.up_to);
        const slabRange = Math.max(0, upperBound - previousUpperBound);
        const taxableInSlab = Math.min(remaining, slabRange);
        totalTax += (taxableInSlab * Number(slab.rate || 0)) / 100;
        remaining -= taxableInSlab;
        previousUpperBound = upperBound;
    }
    return round2(totalTax);
};
export const resolveTaxDeduction = ({ taxComponent, basicSalary, grossSalary, preferredMode = "slab", policyTaxMode, policyTaxRate, policyTaxSlabs, taxApplyProration = false, prorationFactor = 1, }) => {
    const baseTaxItem = {
        name: taxComponent?.name || "Tax",
        basis: taxComponent?.basis || "gross_salary",
    };
    const mode = String(policyTaxMode || preferredMode || "").toLowerCase();
    if (mode === "slab") {
        const slabs = normalizeTaxSlabs(policyTaxSlabs || DEFAULT_MONTHLY_TAX_SLABS);
        const amount = calculateSlabTax(grossSalary, slabs);
        const applicableSlab = slabs.find((slab) => slab.up_to === null || grossSalary <= Number(slab.up_to));
        return {
            amount,
            taxItem: {
                ...baseTaxItem,
                type: "slab",
                mode: "policy-slab",
                slabs,
                applicable_rate: Number(applicableSlab?.rate || 0),
                exemption_reason: amount === 0 ? "exempt_under_slab" : null,
                amount,
            },
        };
    }
    if (mode === "percentage") {
        const taxableBase = baseTaxItem.basis === "basic_salary" ? basicSalary : grossSalary;
        const rate = Number(policyTaxRate || 0);
        const amount = round2((taxableBase * rate) / 100);
        return {
            amount,
            taxItem: {
                ...baseTaxItem,
                type: "percentage",
                mode: "policy-percentage",
                value: rate,
                rate,
                taxable_base: round2(taxableBase),
                amount,
            },
        };
    }
    if (mode === "fixed") {
        const baseAmount = Number(policyTaxRate || 0);
        const amount = round2(baseAmount * (taxApplyProration ? Number(prorationFactor || 0) : 1));
        return {
            amount,
            taxItem: {
                ...baseTaxItem,
                type: "fixed",
                mode: "policy-fixed",
                prorated: Boolean(taxApplyProration),
                base_amount: round2(baseAmount),
                amount,
            },
        };
    }
    if (taxComponent?.tax_mode === "slab" ||
        Array.isArray(taxComponent?.tax_slabs)) {
        const slabs = normalizeTaxSlabs(taxComponent?.tax_slabs || policyTaxSlabs || DEFAULT_MONTHLY_TAX_SLABS);
        const amount = calculateSlabTax(grossSalary, slabs);
        const applicableSlab = slabs.find((slab) => slab.up_to === null || grossSalary <= Number(slab.up_to));
        return {
            amount,
            taxItem: {
                ...baseTaxItem,
                type: "slab",
                mode: "slab",
                slabs,
                applicable_rate: Number(applicableSlab?.rate || 0),
                exemption_reason: amount === 0 ? "exempt_under_slab" : null,
                amount,
            },
        };
    }
    if (taxComponent?.type === "percentage") {
        const taxableBase = taxComponent.basis === "basic_salary" ? basicSalary : grossSalary;
        const rate = Number(taxComponent.value || 0);
        const amount = round2((taxableBase * rate) / 100);
        return {
            amount,
            taxItem: {
                ...baseTaxItem,
                type: "percentage",
                mode: "percentage",
                value: rate,
                rate,
                taxable_base: round2(taxableBase),
                amount,
            },
        };
    }
    if (taxComponent?.type === "fixed") {
        const baseAmount = Number(taxComponent.value || 0);
        const amount = round2(baseAmount * (taxApplyProration ? Number(prorationFactor || 0) : 1));
        return {
            amount,
            taxItem: {
                ...baseTaxItem,
                type: "fixed",
                mode: "fixed",
                prorated: Boolean(taxApplyProration),
                base_amount: round2(baseAmount),
                amount,
            },
        };
    }
    const slabs = normalizeTaxSlabs(policyTaxSlabs || DEFAULT_MONTHLY_TAX_SLABS);
    const amount = calculateSlabTax(grossSalary, slabs);
    const applicableSlab = slabs.find((slab) => slab.up_to === null || grossSalary <= Number(slab.up_to));
    return {
        amount,
        taxItem: {
            ...baseTaxItem,
            type: "slab",
            mode: "slab-default",
            slabs,
            applicable_rate: Number(applicableSlab?.rate || 0),
            exemption_reason: amount === 0 ? "exempt_under_default_slab" : null,
            amount,
        },
    };
};
//# sourceMappingURL=payroll.tax.js.map