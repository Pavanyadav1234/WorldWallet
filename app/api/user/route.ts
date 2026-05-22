import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')?.toLowerCase()
  if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('users').select('*').eq('wallet_address', address).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ user: data })
}