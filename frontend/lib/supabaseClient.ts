import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

// Use the new publishable key (sb_publishable_...) introduced with Supabase's new key format.
// Falls back to the legacy JWT anon key if the publishable key is not set.
const supabaseAnon =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHER_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl)  console.error('[Supabase] ✗ NEXT_PUBLIC_SUPABASE_URL is not set')
if (!supabaseAnon) console.error('[Supabase] ✗ No anon/publisher key found — set NEXT_PUBLIC_SUPABASE_PUBLISHER_KEY')

const keyHint = supabaseAnon?.startsWith('sb_publishable_') ? 'sb_publishable (new)'
              : supabaseAnon?.startsWith('eyJ')             ? 'JWT (legacy)'
              : 'unknown'

console.log(`[Supabase] Initializing client`)
console.log(`[Supabase] URL      : ${supabaseUrl}`)
console.log(`[Supabase] Key type : ${keyHint}`)
console.log(`[Supabase] Key hint : ${supabaseAnon?.slice(0, 20)}...`)

export const supabase = createClient(supabaseUrl, supabaseAnon)
