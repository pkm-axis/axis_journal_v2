/**
 * Client-side user preferences persisted in localStorage.
 * Reactive — read .theme / .sidebarDefault from anywhere; setters update DOM + storage.
 */

type Theme = "light" | "dark" | "system";
type SidebarDefault = "expanded" | "collapsed";

const THEME_KEY = "axis:theme";
const SIDEBAR_KEY = "axis:sidebar-default";

function readTheme(): Theme {
	if (typeof localStorage === "undefined") return "system";
	const v = localStorage.getItem(THEME_KEY);
	return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function readSidebar(): SidebarDefault {
	if (typeof localStorage === "undefined") return "expanded";
	const v = localStorage.getItem(SIDEBAR_KEY);
	return v === "collapsed" ? "collapsed" : "expanded";
}

function applyTheme(theme: Theme) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
	const isDark = theme === "dark" || (theme === "system" && prefersDark);
	root.classList.toggle("dark", isDark);
}

function createPreferencesStore() {
	let theme = $state<Theme>(readTheme());
	let sidebarDefault = $state<SidebarDefault>(readSidebar());

	if (typeof window !== "undefined") {
		applyTheme(theme);
		// React to system theme changes when in "system" mode
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		mq.addEventListener?.("change", () => {
			if (theme === "system") applyTheme("system");
		});
	}

	return {
		get theme() {
			return theme;
		},
		get sidebarDefault() {
			return sidebarDefault;
		},
		setTheme(next: Theme) {
			theme = next;
			localStorage.setItem(THEME_KEY, next);
			applyTheme(next);
		},
		setSidebarDefault(next: SidebarDefault) {
			sidebarDefault = next;
			localStorage.setItem(SIDEBAR_KEY, next);
			// Sync the sidebar provider's cookie so the choice takes effect on next load.
			const open = next === "expanded";
			document.cookie = `sidebar:state=${open}; path=/; max-age=${60 * 60 * 24 * 7}`;
		},
	};
}

export const preferences = createPreferencesStore();
