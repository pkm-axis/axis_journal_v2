import { json } from "@sveltejs/kit";

export async function GET({ locals: { supabase, safeGetSession} }) {
    const { session, user } = await safeGetSession();

    if (!session || !user) {
        return json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
        .schema('trading')
        .from('instruments')
        .select('*')
        .order('created_at', { ascending: false });

    if(error) {
        console.log("Error:", error);
        return json({
            success: false,
            message: error.message
        }, { status: 400 });
    }

    return json({
        success: true,
        data: data,
        message: "Instuments fetched successfully."
    })
}