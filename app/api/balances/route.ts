import { NextResponse } from 'next/server'
import { getWalletBalances } from '@/lib/worldchain'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  const balances = await getWalletBalances(address)
  return NextResponse.json({ balances })
}