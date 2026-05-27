type ConfirmOptions = {
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
};

type ConfirmState = ConfirmOptions & {
	open: boolean;
	resolve: ((value: boolean) => void) | null;
};

const state = $state<ConfirmState>({
	open: false,
	title: "",
	description: undefined,
	confirmLabel: "Confirm",
	cancelLabel: "Cancel",
	destructive: false,
	resolve: null,
});

export const confirmStore = {
	get state() {
		return state;
	},
	respond(value: boolean) {
		const r = state.resolve;
		state.resolve = null;
		state.open = false;
		r?.(value);
	},
};

export function confirm(options: ConfirmOptions): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		state.title = options.title;
		state.description = options.description;
		state.confirmLabel = options.confirmLabel ?? (options.destructive ? "Delete" : "Confirm");
		state.cancelLabel = options.cancelLabel ?? "Cancel";
		state.destructive = options.destructive ?? false;
		state.resolve?.(false);
		state.resolve = resolve;
		state.open = true;
	});
}
