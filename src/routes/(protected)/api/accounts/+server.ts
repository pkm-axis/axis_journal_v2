import { json } from '@sveltejs/kit'

export async function GET({ request, locals }) {
    const supabase = locals.supabase
    const { session, user } = await locals.safeGetSession()

    if (!session || !user) {
        return json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
        .schema('trading')
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)

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