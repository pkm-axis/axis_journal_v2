import { json } from '@sveltejs/kit';

export async function POST({ request, locals: { supabase, safeGetSession } }) {
    const { session, user } = await safeGetSession();

    if (!session || !user) {
        return json({ success: false, message: 'Unauthorized'}, { status: 401 });
    }

    const body = await request.json();

    const {
        account_id,
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
        opened_at,
        closed_at,
        notes
    } = body;

    const { data, error } = await supabase
        .schema('trading')
        .from('trades')
        .insert([
            {
                user_id: user.id,
                account_id,
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
                opened_at,
                closed_at,
                notes
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

    return json({ success: true, data, message: "Trade created successfully." });
}