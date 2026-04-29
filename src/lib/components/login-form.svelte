<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import * as Card from "$lib/components/ui/card/index.js";
	import {
		FieldGroup,
		Field,
		FieldLabel,
		FieldDescription,
	} from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";
	import { supabase } from "$lib/supabase/client";

	let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();

	const id = Math.random().toString(36).slice(2, 10);

	let email = $state("");
	let password = $state("");
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let resetSentMessage = $state<string | null>(null);

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
		const { data, error } = await supabase.auth.signInWithPassword({
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
		errorMessage = null;
		resetSentMessage = "Check your email for a password reset link.";
	}
</script>

<div class={cn("flex flex-col gap-6", className)} {...restProps}>
	<Card.Root class="overflow-hidden p-0">
		<Card.Content class="grid p-0 md:grid-cols-2">
			<form class="p-6 md:p-8" onsubmit={handleSubmit}>
				<FieldGroup>
					<div class="flex flex-col items-center gap-2 text-center">
						<h1 class="text-2xl font-bold">Welcome back</h1>
						<p class="text-muted-foreground text-balance">Sign in to your Axis journal account</p>
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
						</div>
						<Input
							id="password-{id}"
							type="password"
							autocomplete="current-password"
							bind:value={password}
							required
						/>
                        <div class="flex items-center">
                            <button
                            type="button"
                            class="ms-auto text-xs underline-offset-2 hover:underline cursor-pointer"
                            onclick={handleForgotPassword}
                        >
                            Forgot your password?
                        </button>
                        </div>
                        
					</Field>
					<Field>
						<Button type="submit" class="w-full" disabled={loading}>
							{loading ? "Signing in…" : "Login"}
						</Button>
					</Field>
					<FieldDescription class="text-center">
						Don't have an account?
						<a href={resolve("/signup")} class="font-medium underline underline-offset-4">Sign up</a>
					</FieldDescription>
				</FieldGroup>
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
	<FieldDescription class="px-6 text-center">
		By clicking continue, you agree to our
		<a href={resolve("/login")} class="underline underline-offset-4">Terms of Service</a>
		and
		<a href={resolve("/login")} class="underline underline-offset-4">Privacy Policy</a>.
	</FieldDescription>
</div>
