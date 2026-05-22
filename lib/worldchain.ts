import { createPublicClient, http, formatEther, formatUnits } from 'viem'

const worldChain = {
  id: 480, name: 'World Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://worldchain-mainnet.g.alchemy.com/public'] }, public: { http: ['https://worldchain-mainnet.g.alchemy.com/public'] } },
}

export const publicClient = createPublicClient({ chain: worldChain as any, transport: http() })

const TOKENS = {
  WLD:  '0x2cFc85d8E48F8EAB294be644d9E25C3030863003' as `0x${string}`,
  USDC: '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1' as `0x${string}`,
  WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
}

const ERC20_ABI = [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const

export async function getWalletBalances(address: string) {
  try {
    const addr = address as `0x${string}`
    const [wld, usdc, weth, eth] = await Promise.all([
      publicClient.readContract({ address: TOKENS.WLD,  abi: ERC20_ABI, functionName: 'balanceOf', args: [addr] }),
      publicClient.readContract({ address: TOKENS.USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr] }),
      publicClient.readContract({ address: TOKENS.WETH, abi: ERC20_ABI, functionName: 'balanceOf', args: [addr] }),
      publicClient.getBalance({ address: addr }),
    ])
    return {
      WLD:  parseFloat(formatUnits(wld  as bigint, 18)),
      USDC: parseFloat(formatUnits(usdc as bigint, 6)),
      WETH: parseFloat(formatUnits(weth as bigint, 18)),
      ETH:  parseFloat(formatEther(eth)),
    }
  } catch (err) {
    console.error('RPC error:', err)
    return { WLD: 0, USDC: 0, WETH: 0, ETH: 0 }
  }
}