<script lang="ts">
	import { CalendarDate, type DateValue } from "@internationalized/date";
	import { CalendarIcon, XIcon } from "phosphor-svelte";
	import { Button } from "$lib/components/ui/button";
	import { Calendar } from "$lib/components/ui/calendar";
	import { Input } from "$lib/components/ui/input";
	import * as Popover from "$lib/components/ui/popover";
	import { cn } from "$lib/utils";

	type Props = {
		/** "YYYY-MM-DDTHH:mm" (datetime-local) or null. */
		value: string | null;
		onValueChange: (v: string | null) => void;
		placeholder?: string;
		class?: string;
		clearable?: boolean;
		/** Hide the time input; emit YYYY-MM-DDT00:00. */
		dateOnly?: boolean;
	};

	let {
		value,
		onValueChange,
		placeholder = "Pick a date",
		class: className,
		clearable = false,
		dateOnly = false
	}: Props = $props();

	function parseDatePart(v: string | null): CalendarDate | undefined {
		if (!v) return undefined;
		const [date] = v.split("T");
		const [y, m, d] = date.split("-").map(Number);
		if (!y || !m || !d) return undefined;
		return new CalendarDate(y, m, d);
	}

	function parseTimePart(v: string | null): string {
		if (!v) return "09:00";
		const [, time] = v.split("T");
		if (!time) return "09:00";
		const [h, m] = time.split(":");
		return h && m ? `${h}:${m}` : "09:00";
	}

	const dateValue = $derived(parseDatePart(value));
	const timeValue = $derived(parseTimePart(value));

	function combine(date: DateValue | undefined, time: string) {
		if (!date) return null;
		const pad = (n: number) => String(n).padStart(2, "0");
		const match = time && time.match(/^(\d{2}):(\d{2})/);
		const t = match ? `${match[1]}:${match[2]}` : "00:00";
		return `${date.year}-${pad(date.month)}-${pad(date.day)}T${t}`;
	}

	function handleDateChange(d: DateValue | undefined) {
		onValueChange(combine(d, timeValue));
	}

	function handleTimeChange(e: Event) {
		const t = (e.currentTarget as HTMLInputElement).value;
		onValueChange(combine(dateValue, t || "00:00"));
	}

	function formatDisplay(v: string | null) {
		if (!v) return placeholder;
		const d = new Date(v);
		if (Number.isNaN(d.getTime())) return placeholder;
		return new Intl.DateTimeFormat(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric"
		}).format(d);
	}
</script>

<div class={cn("flex gap-2", className)}>
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					class={cn(
						"flex-1 justify-start rounded-md text-left font-normal cursor-pointer",
						!value && "text-muted-foreground"
					)}
				>
					<CalendarIcon class="mr-2 h-4 w-4" />
					{formatDisplay(value)}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-auto p-0" align="start">
			<Calendar
				type="single"
				value={dateValue}
				onValueChange={handleDateChange}
				captionLayout="dropdown"
			/>
		</Popover.Content>
	</Popover.Root>
	{#if !dateOnly}
		<Input
			type="time"
			value={timeValue}
			onchange={handleTimeChange}
			class="w-[120px] rounded-md bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
		/>
	{/if}
	{#if clearable && value}
		<Button
			variant="ghost"
			size="icon"
			class="h-9 w-9 shrink-0 rounded-md cursor-pointer text-muted-foreground"
			aria-label="Clear"
			onclick={() => onValueChange(null)}
		>
			<XIcon size={14} />
		</Button>
	{/if}
</div>
