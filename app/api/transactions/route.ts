import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')?.toLowerCase()
  if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  const { data: cached } = await supabaseAdmin
    .from('transactions').select('*').eq('wallet_address', address)
    .order('timestamp', { ascending: false }).limit(50)
  if (cached && cached.length > 0) return NextResponse.json({ transactions: cached })
  try {
    const res = await fetch(`https://worldchain-mainnet.explorer.alchemy.com/api?module=account&action=txlist&address=${address}&sort=desc&limit=50`)
    const data = await res.json()
    if (data.result && Array.isArray(data.result)) {
      const txs = data.result.map((tx: any) => ({
        wallet_address: address, hash: tx.hash,
        type: tx.from.toLowerCase() === address ? 'send' : 'receive',
        amount: (parseInt(tx.value) / 1e18).toFixed(6), symbol: 'ETH', usd_value: 0,
        from_address: tx.from, to_address: tx.to,
        timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        status: tx.txreceipt_status === '1' ? 'confirmed' : 'pending',
      }))
      if (txs.length > 0) await supabaseAdmin.from('transactions').upsert(txs, { onConflict: 'hash', ignoreDuplicates: true })
      return NextResponse.json({ transactions: txs })
    }
  } catch (err) { console.error('TX fetch error:', err) }
  return NextResponse.json({ transactions: [] })
}