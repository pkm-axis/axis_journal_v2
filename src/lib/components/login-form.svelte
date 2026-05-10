<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import {
		FieldGroup,
		Field,
		FieldLabel,
		FieldDescription,
	} from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLFormAttributes } from "svelte/elements";
	import { supabase } from "$lib/supabase/client";
	import { Eye, EyeOff } from "@lucide/svelte";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLFormAttributes> = $props();

	const id = $props.id();

	let email = $state("");
	let password = $state("");
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let resetSentMessage = $state<string | null>(null);
	let showPassword = $state(false);

	onMount(async () => {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (session) {
			await goto(resolve("/dashboard"), { replaceState: true });
		}
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = null;
		loading = true;
		const { error } = await supabase.auth.signInWithPassword({
			email: email.trim(),
			password,
		});
		loading = false;
		if (error) {
			errorMessage = error.message;
			return;
		}
		await goto(resolve("/dashboard"), { replaceState: true });
	}

	async function handleForgotPassword(e: MouseEvent) {
		e.preventDefault();
		errorMessage = null;
		const addr = email.trim();
		if (!addr) {
			errorMessage = "Enter your email above, then click Forgot your password?";
			return;
		}
		loading = true;
		const { error } = await supabase.auth.resetPasswordForEmail(addr, {
			redirectTo:
				typeof window !== "undefined"
					? `${window.location.origin}${resolve("/login")}`
					: undefined,
		});
		loading = false;
		if (error) {
			errorMessage = error.message;
			return;
		}
		resetSentMessage = "Check your email for a password reset link.";
	}
</script>

<form
	class={cn("flex flex-col gap-6", className)}
	bind:this={ref}
	onsubmit={handleSubmit}
	{...restProps}
>
	<FieldGroup>
		<div class="flex flex-col items-center gap-1 text-center">
			<h1 class="text-2xl font-bold">Login to your account</h1>
			<p class="text-muted-foreground text-sm text-balance">
				Enter your email below to login to your account
			</p>
		</div>
		{#if errorMessage}
			<p class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
				{errorMessage}
			</p>
		{/if}
		{#if resetSentMessage}
			<p class="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-foreground">
				{resetSentMessage}
			</p>
		{/if}
		<Field>
			<FieldLabel for="email-{id}">Email</FieldLabel>
			<Input
				id="email-{id}"
				type="email"
				autocomplete="email"
				placeholder="m@example.com"
				bind:value={email}
				required
			/>
		</Field>
		<Field>
			<div class="flex items-center">
				<FieldLabel for="password-{id}">Password</FieldLabel>
				<button
					type="button"
					class="ms-auto text-sm underline-offset-4 hover:underline cursor-pointer"
					onclick={handleForgotPassword}
				>
					Forgot your password?
				</button>
			</div>
			<div class="relative">
				<Input
					id="password-{id}"
					type={showPassword ? "text" : "password"}
					autocomplete="current-password"
					bind:value={password}
					required
					class="pr-8"
				/>
				<button
					type="button"
					class="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
					onclick={() => (showPassword = !showPassword)}
					tabindex="-1"
				>
					{#if showPassword}
						<EyeOff size={14} />
					{:else}
						<Eye size={14} />
					{/if}
				</button>
			</div>
		</Field>
		<Field>
			<Button type="submit" disabled={loading}>
				{loading ? "Signing in…" : "Login"}
			</Button>
			<FieldDescription class="text-center">
				Don't have an account?
				<a href={resolve("/signup")} class="underline underline-offset-4">Sign up</a>
			</FieldDescription>
		</Field>
	</FieldGroup>
</form>
