import { json } from "@sveltejs/kit";

export async function GET({ locals: { supabase, safeGetSession } }) {
    const { session, user } = await safeGetSession();
    if (!session || !user) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    // Global catalog.
    const { data: catalog, error: catalogErr } = await supabase
        .schema("trading")
        .from("instruments")
        .select("*")
        .order("symbol", { ascending: true });

    if (catalogErr) {
        return json({ success: false, message: catalogErr.message }, { status: 400 });
    }

    // This user's overrides.
    const { data: overrides, error: overrideErr } = await supabase
        .schema("trading")
        .from("user_instruments")
        .select("instrument_id, commission_per_side, is_active")
        .eq("user_id", user.id);

    if (overrideErr) {
        return json({ success: false, message: overrideErr.message }, { status: 400 });
    }

    type Override = { instrument_id: string; commission_per_side: number; is_active: boolean };
    const byId = new Map<string, Override>(
        ((overrides ?? []) as Override[]).map((o) => [o.instrument_id, o])
    );

    // Flatten the override onto each catalog row so the rest of the app can
    // treat commission_per_side as a plain field on the instrument.
    const merged = (catalog ?? []).map((row: Record<string, unknown>) => {
        const o = byId.get(row.id as string);
        return {
            ...row,
            commission_per_side: o?.commission_per_side ?? 0,
            is_active: o?.is_active ?? true,
            has_override: !!o,
        };
    });

    return json({
        success: true,
        data: merged,
        message: "Instruments fetched successfully.",
    });
}
