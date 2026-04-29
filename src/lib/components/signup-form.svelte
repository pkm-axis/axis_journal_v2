<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { cn } from "$lib/utils.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import type { HTMLAttributes } from "svelte/elements";
	import { supabase } from "$lib/supabase/client";

	let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();

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

<div class={cn("flex flex-col gap-6", className)} {...restProps}>
	<Card.Root class="overflow-hidden p-0">
		<Card.Content class="grid p-0 md:grid-cols-2">
			<form class="p-6 md:p-8" onsubmit={handleSubmit}>
				<Field.Group>
					<div class="flex flex-col items-center gap-2 text-center">
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
						<Field.Label for="signup-email">Email</Field.Label>
						<Input
							id="signup-email"
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
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<Field.Field>
								<Field.Label for="signup-password">Password</Field.Label>
								<Input
									id="signup-password"
									type="password"
									autocomplete="new-password"
									bind:value={password}
									required
									minlength={8}
								/>
							</Field.Field>
							<Field.Field>
								<Field.Label for="signup-confirm">Confirm password</Field.Label>
								<Input
									id="signup-confirm"
									type="password"
									autocomplete="new-password"
									bind:value={confirmPassword}
									required
									minlength={8}
								/>
							</Field.Field>
						</div>
						<Field.Description>Must be at least 8 characters long.</Field.Description>
					</Field.Field>
					<Field.Field>
						<Button type="submit" class="w-full" disabled={loading}>
							{loading ? "Creating account…" : "Create account"}
						</Button>
					</Field.Field>
					<Field.Description class="text-center">
						Already have an account?
						<a href={resolve("/login")} class="font-medium underline underline-offset-4">Sign in</a>
					</Field.Description>
				</Field.Group>
			</form>
			<div class="bg-muted relative hidden md:block">
				<img
					src="/axis-main.png"
					alt=""
					class="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
				/>
			</div>
		</Card.Content>
	</Card.Root>
	<Field.Description class="px-6 text-center">
		By clicking continue, you agree to our
		<a href={resolve("/login")} class="underline underline-offset-4">Terms of Service</a>
		and
		<a href={resolve("/login")} class="underline underline-offset-4">Privacy Policy</a>.
	</Field.Description>
</div>
