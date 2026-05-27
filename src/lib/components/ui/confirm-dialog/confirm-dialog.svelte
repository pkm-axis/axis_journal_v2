<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import { Button } from "$lib/components/ui/button";
	import { confirmStore } from "./confirm.svelte";

	const s = confirmStore.state;
</script>

<Dialog.Root
	bind:open={s.open}
	onOpenChange={(open) => {
		if (!open && s.resolve) confirmStore.respond(false);
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{s.title}</Dialog.Title>
			{#if s.description}
				<Dialog.Description class="whitespace-pre-line">{s.description}</Dialog.Description>
			{/if}
		</Dialog.Header>
		<Dialog.Footer>
			<Button
				variant="outline"
				class="rounded-md cursor-pointer"
				onclick={() => confirmStore.respond(false)}
			>
				{s.cancelLabel}
			</Button>
			<Button
				class={[
					"rounded-md cursor-pointer",
					s.destructive &&
						"bg-rose-700 text-white hover:bg-rose-700/90 dark:bg-rose-600 dark:hover:bg-rose-600/90",
				]}
				onclick={() => confirmStore.respond(true)}
			>
				{s.confirmLabel}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
