<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import type { HTMLFormAttributes } from "svelte/elements";
	import { supabase } from "$lib/supabase/client";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLFormAttributes> = $props();

	const id = $props.id();

	let email = $state("");
	let password = $state("");
	let confirmPassword = $state("");
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let infoMessage = $state<string | null>(null);

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
		infoMessage = null;

		if (password.length < 8) {
			errorMessage = "Password must be at least 8 characters.";
			return;
		}
		if (password !== confirmPassword) {
			errorMessage = "Passwords do not match.";
			return;
		}

		loading = true;
		const { data, error } = await supabase.auth.signUp({
			email: email.trim(),
			password,
			options: {
				emailRedirectTo: `${window.location.origin}/auth/callback`,
			},
		});
		loading = false;

		if (error) {
			errorMessage = error.message;
			return;
		}

		if (data.user && data.session) {
			await goto(resolve("/dashboard"), { replaceState: true });
			return;
		}

		infoMessage =
			"Check your email to confirm your account. After confirming, you can sign in.";
	}
</script>

<form
	class={cn("flex flex-col gap-6", className)}
	bind:this={ref}
	onsubmit={handleSubmit}
	{...restProps}
>
	<Field.Group>
		<div class="flex flex-col items-center gap-1 text-center">
			<h1 class="text-2xl font-bold">Create your account</h1>
			<p class="text-muted-foreground text-sm text-balance">
				Enter your email below to create your account
			</p>
		</div>
		{#if errorMessage}
			<p class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
				{errorMessage}
			</p>
		{/if}
		{#if infoMessage}
			<p class="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-foreground">
				{infoMessage}
			</p>
		{/if}
		<Field.Field>
			<Field.Label for="email-{id}">Email</Field.Label>
			<Input
				id="email-{id}"
				type="email"
				autocomplete="email"
				placeholder="m@example.com"
				bind:value={email}
				required
			/>
			<Field.Description>
				We'll use this to contact you. We will not share your email with anyone else.
			</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label for="password-{id}">Password</Field.Label>
			<Input
				id="password-{id}"
				type="password"
				autocomplete="new-password"
				bind:value={password}
				required
				minlength={8}
			/>
			<Field.Description>Must be at least 8 characters long.</Field.Description>
		</Field.Field>
		<Field.Field>
			<Field.Label for="confirm-{id}">Confirm Password</Field.Label>
			<Input
				id="confirm-{id}"
				type="password"
				autocomplete="new-password"
				bind:value={confirmPassword}
				required
				minlength={8}
			/>
			<Field.Description>Please confirm your password.</Field.Description>
		</Field.Field>
		<Field.Field>
			<Button type="submit" disabled={loading}>
				{loading ? "Creating account…" : "Create Account"}
			</Button>
			<Field.Description class="text-center">
				Already have an account?
				<a href={resolve("/login")} class="underline underline-offset-4">Sign in</a>
			</Field.Description>
		</Field.Field>
	</Field.Group>
</form>
