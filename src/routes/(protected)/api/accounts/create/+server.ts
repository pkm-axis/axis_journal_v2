import { json } from '@sveltejs/kit'

export async function POST({ request, locals: { supabase, safeGetSession } }) {
    const { session, user } = await safeGetSession()

    if (!session || !user) {
        return json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json();

    const {
        name,
        account_type,
        platform,
        currency,
        starting_balance,
    
        prop_firm_name,
        prop_firm_type,
        prop_firm_profit_target,
        prop_firm_max_drawdown,
        prop_firm_daily_loss_limit,
        prop_firm_consistency_rule,
        prop_firm_max_contracts,
        prop_firm_drawdown_type,
        challenge_cost,
        profit_split,
        parent_account_id,
        status,
      } = body;

      const { data, error } = await supabase
        .schema('trading')
        .from('accounts')
        .insert([
            {
                user_id: user.id,
                name,
                account_type,
                platform,
                currency,
                starting_balance,

                prop_firm_name,
                prop_firm_type,
                prop_firm_profit_target,
                prop_firm_max_drawdown,
                prop_firm_daily_loss_limit,
                prop_firm_consistency_rule,
                prop_firm_max_contracts,
                prop_firm_drawdown_type,
                // challenge_cost is deliberately NOT written: the cost goes to the
                // trading.account_expenses ledger below. Writing both would leave
                // the deprecated column looking authoritative, and would double the
                // cost if the backfill migration is ever re-applied.
                profit_split,
                parent_account_id,
                // Backfilling a past account: create it already retired.
                status: ["active", "breached", "passed", "closed"].includes(status)
                    ? status
                    : "active",
            }
        ])
        .select()
        .single()

    if (error) {
        console.log("Error:", error)
        return json({
            success: false,
            message: error.message
        }, { status: 400 })
    }

    /**
     * The form still collects a single up-front challenge cost, but the ledger in
     * trading.account_expenses is what gets read — resets and recurring fees have
     * no column to live in. Record the initial fee as the account's first entry.
     */
    const cost = Number(challenge_cost);
    if (Number.isFinite(cost) && cost > 0) {
        const { error: expenseErr } = await supabase
            .schema("trading")
            .from("account_expenses")
            .insert({
                user_id: user.id,
                account_id: data.id,
                kind: "challenge",
                amount: cost,
                currency: typeof currency === "string" && currency.trim() ? currency.trim() : "USD",
                notes: null,
            });
        // Non-fatal: the account exists and the cost can be added by hand.
        if (expenseErr) console.log("Challenge cost ledger insert error:", expenseErr);
    }

    return json({ success: true, data: data, message: "Account created successfully." });
}