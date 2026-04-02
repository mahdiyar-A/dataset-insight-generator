import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
// Use the new publishable key format (sb_publishable_...) — this replaces the legacy JWT anon key
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHER_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnon)