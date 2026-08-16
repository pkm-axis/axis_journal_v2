/** Mirrors the `kind` CHECK constraint on trading.account_expenses. */
export const EXPENSE_KINDS = [
	"challenge",
	"reset",
	"activation",
	"platform",
	"data_feed",
	"other"
] as const;

export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export const EXPENSE_KIND_LABELS: Record<ExpenseKind, string> = {
	challenge: "Challenge fee",
	reset: "Reset",
	activation: "Activation fee",
	platform: "Platform fee",
	data_feed: "Data feed",
	other: "Other"
};

export function isExpenseKind(v: unknown): v is ExpenseKind {
	return typeof v === "string" && (EXPENSE_KINDS as readonly string[]).includes(v);
}
