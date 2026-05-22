import { NextResponse } from 'next/server'
import { MiniKit } from '@worldcoin/minikit-js'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const { payload, nonce } = await req.json()
    if (!payload || !nonce) {
      return NextResponse.json({ success: false, error: 'Missing payload or nonce' })
    }
    const result = await MiniKit.verifySiweMessage(payload, nonce)
    if (!result.isValid) {
      return NextResponse.json({ success: false, error: 'Invalid signature' })
    }
    const address = payload.address.toLowerCase()
    await supabaseAdmin.from('users').upsert(
      { wallet_address: address, verification_level: payload.verificationLevel ?? 'device', last_seen: new Date().toISOString() },
      { onConflict: 'wallet_address' }
    )
    return NextResponse.json({ success: true, address, verificationLevel: payload.verificationLevel ?? 'device' })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) })
  }
}