import { json } from '@sveltejs/kit'

export async function GET({ url, locals: { supabase, safeGetSession } }) {
    const { session, user } =await safeGetSession();
    const accountId = url.searchParams.get("accountId");

    if (!session || !user) {
        return json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
        .schema("trading")
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .eq("account_id", accountId)
        .order("opened_at", { ascending: false });

    if (error) {
        console.log("Error:", error)
        return json({ 
            success: false,
            message: error.message 
        }, { status: 400 })
    }

    return json({ 
        success: true, 
        data: data, 
        message: "Accounts fetch successfully." 
    });
}