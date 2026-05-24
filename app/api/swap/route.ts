import { NextResponse } from 'next/server'

const YOUR_FEE_WALLET = '0x6b835184085539ee8705b326dca844fb56e8423f'
const FEE_PERCENT     = 0.02 // 2%

// Token addresses on World Chain
const TOKEN_ADDRESSES: Record<string, string> = {
  WLD:  '0x2cFc85d8E48F8EAB294be644d9E25C3030863003',
  USDC: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1',
  WETH: '0x4200000000000000000000000000000000000006',
  USDT: '0x05D032ac25d322df992303dCa074EE7392C117b9',
  DAI:  '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  WBTC: '0x03C7054BCB39f7b2e5B2c7AcB37583e32D70Cfa',
  ETH:  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  OP:   '0x4200000000000000000000000000000000000042',
}

export async function POST(req: Request) {
  try {
    const { fromToken, toToken, amount, userAddress } = await req.json()

    const sellToken = TOKEN_ADDRESSES[fromToken]
    const buyToken  = TOKEN_ADDRESSES[toToken]

    if (!sellToken || !buyToken) {
      return NextResponse.json({ success: false, error: 'Token not supported' })
    }

    if (!userAddress) {
      return NextResponse.json({ success: false, error: 'Missing wallet address' })
    }

    // Convert amount to wei (18 decimals for most tokens, 6 for USDC/USDT)
    const decimals = ['USDC', 'USDT'].includes(fromToken) ? 6 : 18
    const sellAmountWei = BigInt(Math.round(parseFloat(amount) * Math.pow(10, decimals))).toString()

    // Get quote from 0x API on World Chain
    const params = new URLSearchParams({
      chainId:              '480',
      sellToken,
      buyToken,
      sellAmount:           sellAmountWei,
      taker:                userAddress,
      swapFeeRecipient:     YOUR_FEE_WALLET,
      swapFeeBps:           String(Math.round(FEE_PERCENT * 10000)), // 200 bps = 2%
      swapFeeToken:         sellToken,
    })

    const res = await fetch(
      `https://api.0x.org/swap/permit2/quote?${params}`,
      {
        headers: {
          '0x-api-key':  process.env.ZEROX_API_KEY || '',
          '0x-version':  'v2',
        }
      }
    )

    const quote = await res.json()

    if (!res.ok || quote.code) {
      return NextResponse.json({
        success: false,
        error: quote.reason || quote.message || 'Quote failed'
      })
    }

    return NextResponse.json({
      success:   true,
      buyAmount: quote.buyAmount,
      sellAmount: quote.sellAmount,
      price:     quote.price,
      transaction: {
        to:    quote.transaction?.to,
        data:  quote.transaction?.data,
        value: quote.transaction?.value,
        gas:   quote.transaction?.gas,
      },
      permit2: quote.permit2,
    })

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) })
  }
}