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
        prop_firm_max_contracts
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
                prop_firm_max_contracts
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

    return json({ success: true, data: data, message: "Account created successfully." });
}