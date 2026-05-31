export function num(v: unknown): number | null {
	if (v == null || v === "") return null;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}

export type TradeSide = "long" | "short";

export function normalizeSide(side: string | null | undefined): TradeSide | null {
	if (!side) return null;
	const s = String(side).toLowerCase();
	return s === "long" || s === "short" ? s : null;
}

export function riskRewardRatio(
	entry: number,
	stop: number,
	takeProfit: number,
	side: TradeSide,
): number | null {
	if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(takeProfit)) return null;
	const riskDist = side === "long" ? entry - stop : stop - entry;
	const rewardDist = side === "long" ? takeProfit - entry : entry - takeProfit;
	if (riskDist <= 0 || rewardDist <= 0) return null;
	return rewardDist / riskDist;
}
