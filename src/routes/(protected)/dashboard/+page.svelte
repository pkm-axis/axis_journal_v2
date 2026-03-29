<script lang="ts">
    import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
    import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
</script>

<HeaderNavbar links={true}>
    <Breadcrumb.Root>
        <Breadcrumb.List>
            <Breadcrumb.Page>Dashboard</Breadcrumb.Page>
        </Breadcrumb.List>
    </Breadcrumb.Root>
</HeaderNavbar>