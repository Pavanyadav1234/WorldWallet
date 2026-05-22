import { NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

export async function POST(req: Request) {
  try {
    const { payload, nonce } = await req.json()

    if (!payload || !nonce) {
      return NextResponse.json({ success: false, error: 'Missing payload or nonce' })
    }

    const address = payload.address?.toLowerCase()

    if (!address) {
      return NextResponse.json({ success: false, error: 'No address in payload' })
    }

    // Import supabase here to save user
    const { supabaseAdmin } = await import('@/lib/supabase')

    await supabaseAdmin.from('users').upsert(
      {
        wallet_address: address,
        verification_level: payload.verificationLevel ?? 'device',
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'wallet_address' }
    )

    return NextResponse.json({
      success: true,
      address,
      verificationLevel: payload.verificationLevel ?? 'device',
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) })
  }
}