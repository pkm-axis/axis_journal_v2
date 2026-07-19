import { num } from "./number";

export type FormatUsdOptions = {
	sign?: boolean;
	maxFractionDigits?: number;
};

export function formatUsd(value: number | null | undefined, options: FormatUsdOptions = {}): string {
	if (value == null || !Number.isFinite(value)) return "—";
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: "USD",
		signDisplay: options.sign ? "exceptZero" : "auto",
		maximumFractionDigits: options.maxFractionDigits ?? 2,
	}).format(value);
}

/** Decimal places implied by a tick size (e.g. 0.25 → 2, 0.0001 → 4). */
export function decimalsForTick(tickSize: number | null | undefined): number {
	if (!tickSize || !Number.isFinite(tickSize) || tickSize <= 0) return 0;
	const s = Math.abs(tickSize).toString();
	if (s.includes("e-")) return parseInt(s.split("e-")[1], 10);
	const dot = s.indexOf(".");
	return dot === -1 ? 0 : s.length - dot - 1;
}

export function formatPrice(
	value: string | number | null | undefined,
	tickSize?: number | null
): string {
	const n = num(value);
	if (n == null) return "—";
	if (tickSize && Number.isFinite(tickSize) && tickSize > 0) {
		const rounded = Math.round(n / tickSize) * tickSize;
		const digits = decimalsForTick(tickSize);
		return new Intl.NumberFormat(undefined, {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		}).format(rounded);
	}
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(n);
}

export function formatQty(value: string | number | null | undefined): string {
	const n = num(value);
	if (n == null) return "—";
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(n);
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
	if (value == null || !Number.isFinite(value)) return "—";
	return new Intl.NumberFormat(undefined, {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}).format(value);
}

/** `value` is already a percentage (e.g. 5.5 → "5.50%"). */
export function formatPercent(value: number | null | undefined, digits = 2): string {
	if (value == null || !Number.isFinite(value)) return "—";
	return `${value.toFixed(digits)}%`;
}

/** `value` is a fraction in [0, 1] (e.g. 0.055 → "5.50%"). */
export function formatFraction(value: number | null | undefined, digits = 2): string {
	if (value == null || !Number.isFinite(value)) return "—";
	return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(d);
}

export function formatWhen(iso: string | null | undefined): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(d);
}

export function formatRiskReward(rr: number | null | undefined): string {
	if (rr == null || !Number.isFinite(rr)) return "—";
	return `1:${rr.toFixed(2)}`;
}
