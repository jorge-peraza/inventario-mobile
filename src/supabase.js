import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mftnkcoahqwrazsurblx.supabase.co'
const supabaseKey = 'sb_publishable_sLChAJzc1OwbrjXnnaSJmg_4PeMQaRO'

export const supabase = createClient(supabaseUrl, supabaseKey)