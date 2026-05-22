import { NextResponse } from 'next/server'

export async function GET() {
  const nonce =
    Math.random().toString(36).slice(2, 18) +
    Math.random().toString(36).slice(2, 18)
  return NextResponse.json({ nonce })
}