import { json } from '@sveltejs/kit';

export async function POST({ request, locals: { supabase, safeGetSession } }) {
    const { session, user } = await safeGetSession();

    if (!session || !user) {
        return json({ success: false, message: 'Unauthorized'}, { status: 401 });
    }

    const body = await request.json();

    const {
        account_id,
        backtest_session_id,
        instrument_id,
        symbol,
        side,
        status,
        entry_price,
        exit_price,
        quantity,
        stop_loss,
        take_profit,
        risk,
        pnl,
        commission,
        highest_unrealized_profit,
        opened_at,
        closed_at,
        notes,
        emotional_states,
        confidence,
        mental_state,
        followed_plan,
        entry_reason,
        exit_reason,
        strategy_ids,
        mistake_ids,
        checklist_item_ids,
        mirror_accounts
    } = body;

    if (!account_id === !backtest_session_id) {
        return json({ success: false, message: "Trade must belong to exactly one of account or backtest session." }, { status: 400 });
    }

    /**
     * Copytraded trades: the same decision logged against several accounts. Each
     * mirror gets its own row (own size, own P&L, own prop-firm rules) but all of
     * them share a trade_group_id so cross-account aggregates can count the one
     * decision once. Backtest trades have no account, so they can't be mirrored.
     */
    type MirrorInput = {
        account_id?: unknown;
        quantity?: unknown;
        pnl?: unknown;
        commission?: unknown;
        highest_unrealized_profit?: unknown;
    };
    const mirrors: MirrorInput[] =
        account_id && Array.isArray(mirror_accounts) ? mirror_accounts : [];
    // Dedupe: a repeated id would otherwise land the same trade on one account
    // twice, which is exactly the double-count the grouping exists to prevent.
    const mirrorAccountIds = [
        ...new Set(
            mirrors
                .map((m) => m?.account_id)
                .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
                .filter((id) => id !== account_id)
        )
    ];

    if (mirrorAccountIds.length > 0) {
        // Don't take the client's word for account ownership — a trade row carries
        // the caller's user_id, so RLS alone wouldn't stop it naming someone else's
        // account. Verify every mirror target belongs to this user.
        const { data: owned, error: ownErr } = await supabase
            .schema("trading")
            .from("accounts")
            .select("id")
            .eq("user_id", user.id)
            .in("id", mirrorAccountIds);
        if (ownErr) {
            return json({ success: false, message: ownErr.message }, { status: 400 });
        }
        if ((owned?.length ?? 0) !== mirrorAccountIds.length) {
            return json({ success: false, message: "One or more mirror accounts were not found." }, { status: 400 });
        }
    }

    const tradeGroupId = mirrorAccountIds.length > 0 ? crypto.randomUUID() : null;

    /**
     * A trade has exactly one strategy (trades.strategy_id) since
     * 20260725000000_strategy_checklists dropped trading.trade_strategies. The
     * client still sends an array, so take the first valid id.
     */
    const strategyId = Array.isArray(strategy_ids)
        ? (strategy_ids.find(
              (sid: unknown): sid is string => typeof sid === "string" && sid.length > 0
          ) ?? null)
        : null;

    const { data, error } = await supabase
        .schema('trading')
        .from('trades')
        .insert([
            {
                user_id: user.id,
                account_id: account_id ?? null,
                backtest_session_id: backtest_session_id ?? null,
                instrument_id,
                symbol,
                side,
                status,
                entry_price,
                exit_price,
                quantity,
                stop_loss,
                take_profit,
                risk,
                pnl,
                commission: commission ?? 0,
                highest_unrealized_profit: highest_unrealized_profit ?? null,
                opened_at,
                closed_at,
                notes,
                strategy_id: strategyId,
                trade_group_id: tradeGroupId
            }
        ])
        .select()
        .single();

    if (error) {
        console.log("Error:", error);
        return json({
            success: false,
            message: error.message
        }, { status: 400 })
    }

    /**
     * Mirror rows reuse the primary's setup (symbol, side, prices, timing) and
     * override only what genuinely differs per account: size, realized P&L,
     * commission and the intraday-drawdown peak. Anything omitted falls back to
     * the primary's value.
     */
    const tradeIds: string[] = [data.id];
    if (mirrorAccountIds.length > 0) {
        const numOr = (v: unknown, fallback: unknown) =>
            v === null || v === "" || v === undefined ? fallback : Number(v);
        const mirrorRows = mirrorAccountIds.map((mirrorAccountId) => {
            const m = mirrors.find((x) => x?.account_id === mirrorAccountId) ?? {};
            return {
                user_id: user.id,
                account_id: mirrorAccountId,
                backtest_session_id: null,
                instrument_id,
                symbol,
                side,
                status,
                entry_price,
                exit_price,
                quantity: numOr(m.quantity, quantity),
                stop_loss,
                take_profit,
                risk,
                pnl: numOr(m.pnl, pnl),
                commission: numOr(m.commission, commission ?? 0),
                highest_unrealized_profit: numOr(
                    m.highest_unrealized_profit,
                    highest_unrealized_profit ?? null
                ),
                opened_at,
                closed_at,
                notes,
                strategy_id: strategyId,
                trade_group_id: tradeGroupId
            };
        });

        const { data: mirrorData, error: mirrorErr } = await supabase
            .schema("trading")
            .from("trades")
            .insert(mirrorRows)
            .select("id");

        if (mirrorErr) {
            // The primary row is already committed. Roll it back rather than leave
            // a half-mirrored group behind, which would silently under-count the
            // accounts the trade actually ran on.
            await supabase.schema("trading").from("trades").delete().eq("id", data.id);
            console.log("Mirror insert error:", mirrorErr);
            return json({ success: false, message: mirrorErr.message }, { status: 400 });
        }

        for (const row of mirrorData ?? []) tradeIds.push(row.id);
    }

    const hasPsychology =
        (Array.isArray(emotional_states) && emotional_states.length > 0) ||
        confidence != null ||
        (typeof mental_state === "string" && mental_state.length > 0) ||
        (followed_plan != null && followed_plan !== "") ||
        (typeof entry_reason === "string" && entry_reason.length > 0) ||
        (typeof exit_reason === "string" && exit_reason.length > 0);
    if (hasPsychology) {
        // Psychology, mistakes and checklist answers describe the decision, not the
        // account it was filled on, so every row in the group carries the same set.
        const { error: psychErr } = await supabase
            .schema("trading")
            .from("trade_psychology")
            .insert(tradeIds.map((trade_id) => ({
                trade_id,
                emotional_states: Array.isArray(emotional_states) ? emotional_states : [],
                confidence: confidence ?? null,
                mental_state: mental_state ?? null,
                followed_plan: followed_plan ?? null,
                entry_reason: entry_reason ?? null,
                exit_reason: exit_reason ?? null
            })));
        if (psychErr) console.log("Psychology insert error:", psychErr);
    }

    if (status === "closed" && Array.isArray(mistake_ids) && mistake_ids.length > 0) {
        const rows = mistake_ids
            .filter((mid: unknown): mid is string => typeof mid === "string" && mid.length > 0)
            .flatMap((mistake_id: string) => tradeIds.map((trade_id) => ({ trade_id, mistake_id })));
        if (rows.length > 0) {
            const { error: linkErr } = await supabase
                .schema("trading")
                .from("trade_mistakes")
                .insert(rows);
            if (linkErr) console.log("Mistake link error:", linkErr);
        }
    }

    if (Array.isArray(checklist_item_ids) && checklist_item_ids.length > 0) {
        const rows = checklist_item_ids
            .filter((cid: unknown): cid is string => typeof cid === "string" && cid.length > 0)
            .flatMap((item_id: string) => tradeIds.map((trade_id) => ({ trade_id, item_id })));
        if (rows.length > 0) {
            const { error: linkErr } = await supabase
                .schema("trading")
                .from("trade_checklist_responses")
                .insert(rows);
            if (linkErr) console.log("Checklist link error:", linkErr);
        }
    }

    return json({
        success: true,
        data,
        trade_ids: tradeIds,
        message: tradeIds.length > 1
            ? `Trade logged across ${tradeIds.length} accounts.`
            : "Trade created successfully."
    });
}