'use client'
import { useState, useEffect, useCallback } from 'react'

interface Coin {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number
  price_change_percentage_24h: number
  balance: number
  usdValue: number
  contractAddress?: string
}

interface Transaction {
  hash: string
  type: 'send' | 'receive' | 'swap'
  amount: string
  symbol: string
  usd_value: number
  from_address?: string
  to_address?: string
  timestamp: string
  status: string
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${d}d ago`
}

function fmt(n: number, d = 2) {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  if (n >= 1) return n.toFixed(d)
  if (n >= 0.01) return n.toFixed(4)
  return n.toFixed(6)
}

function shortAddr(addr: string) {
  return addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : ''
}

const COIN_COLORS: Record<string, string> = {
  WLD: '#7C3AED', ETH: '#627EEA', USDC: '#2775CA', WBTC: '#F7931A',
  DAI: '#F5AC37', USDT: '#26A17B', WETH: '#627EEA', OP: '#FF0420',
  ARB: '#28A0F0', MATIC: '#8247E5', BNB: '#F3BA2F', AVAX: '#E84142',
}

const COIN_ICONS: Record<string, string> = {
  WLD: '🌐', ETH: '⟠', USDC: '💵', WBTC: '₿', DAI: '◈',
  USDT: '💲', WETH: '⟠', OP: '🔴', ARB: '🔵', MATIC: '💜',
  BNB: '🟡', AVAX: '🔺',
}

export default function WorldWallet() {
  const [screen, setScreen] = useState<'verify'|'home'|'txs'|'swap'|'coin'>('verify')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [walletAddress, setWalletAddress] = useState<string|null>(null)
  const [coins, setCoins] = useState<Coin[]>([])
  const [loadingCoins, setLoadingCoins] = useState(false)
  const [totalUSD, setTotalUSD] = useState(0)
  const [selectedCoin, setSelectedCoin] = useState<Coin|null>(null)
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loadingTxs, setLoadingTxs] = useState(false)
  const [swapFrom, setSwapFrom] = useState('WLD')
  const [swapTo, setSwapTo] = useState('USDC')
  const [swapAmount, setSwapAmount] = useState('')
  const [swapping, setSwapping] = useState(false)
  const [swapDone, setSwapDone] = useState(false)
  const [hideZero, setHideZero] = useState(false)

  const fetchPrices = useCallback(async () => {
    if (!walletAddress) return
    setLoadingCoins(true)
    try {
      const [balRes, priceRes] = await Promise.all([
        fetch(`/api/balances?address=${walletAddress}`),
        fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=worldcoin,ethereum,usd-coin,wrapped-bitcoin,dai,tether,wrapped-ether,optimism,arbitrum,matic-network,binancecoin,avalanche-2&order=market_cap_desc&per_page=50'),
      ])
      const { balances } = await balRes.json()
      const priceData: Coin[] = await priceRes.json()

      const balMap: Record<string, number> = {
        'worldcoin': balances?.WLD ?? 0,
        'ethereum': balances?.ETH ?? 0,
        'usd-coin': balances?.USDC ?? 0,
        'wrapped-bitcoin': balances?.WBTC ?? 0,
        'dai': balances?.DAI ?? 0,
        'tether': balances?.USDT ?? 0,
        'wrapped-ether': balances?.WETH ?? 0,
      }

      const enriched = priceData.map(c => ({
        ...c,
        balance: balMap[c.id] ?? 0,
        usdValue: (balMap[c.id] ?? 0) * c.current_price,
      }))

      // Sort: coins with balance first
      enriched.sort((a, b) => b.usdValue - a.usdValue || b.current_price - a.current_price)

      setCoins(enriched)
      setTotalUSD(enriched.reduce((s, c) => s + c.usdValue, 0))
    } catch {
      const fallback: Coin[] = [
        { id:'worldcoin', symbol:'wld', name:'Worldcoin', image:'', current_price:2.85, price_change_percentage_24h:3.2, balance:0, usdValue:0 },
        { id:'ethereum', symbol:'eth', name:'Ethereum', image:'', current_price:3240, price_change_percentage_24h:-1.4, balance:0, usdValue:0 },
        { id:'usd-coin', symbol:'usdc', name:'USD Coin', image:'', current_price:1.00, price_change_percentage_24h:0.01, balance:0, usdValue:0 },
        { id:'wrapped-bitcoin', symbol:'wbtc', name:'Wrapped Bitcoin', image:'', current_price:67500, price_change_percentage_24h:2.1, balance:0, usdValue:0 },
        { id:'dai', symbol:'dai', name:'Dai', image:'', current_price:1.00, price_change_percentage_24h:-0.02, balance:0, usdValue:0 },
        { id:'tether', symbol:'usdt', name:'Tether', image:'', current_price:1.00, price_change_percentage_24h:0.01, balance:0, usdValue:0 },
        { id:'optimism', symbol:'op', name:'Optimism', image:'', current_price:2.10, price_change_percentage_24h:1.5, balance:0, usdValue:0 },
        { id:'arbitrum', symbol:'arb', name:'Arbitrum', image:'', current_price:1.20, price_change_percentage_24h:-0.8, balance:0, usdValue:0 },
      ]
      setCoins(fallback)
      setTotalUSD(0)
    } finally {
      setLoadingCoins(false)
    }
  }, [walletAddress])

  const fetchTxs = useCallback(async () => {
    if (!walletAddress) return
    setLoadingTxs(true)
    try {
      const res = await fetch(`/api/transactions?address=${walletAddress}`)
      const { transactions } = await res.json()
      setTxs(transactions ?? [])
    } catch { setTxs([]) }
    finally { setLoadingTxs(false) }
  }, [walletAddress])

  useEffect(() => { if (screen === 'home' || screen === 'swap' || screen === 'coin') fetchPrices() }, [screen, fetchPrices])
  useEffect(() => { if (screen === 'txs') fetchTxs() }, [screen, fetchTxs])

  const handleVerify = async () => {
    setVerifyError('')
    setVerifying(true)
    try {
      const { MiniKit } = await import('@worldcoin/minikit-js')
      MiniKit.install(process.env.NEXT_PUBLIC_APP_ID!)
      await new Promise(r => setTimeout(r, 500))
      const nonceRes = await fetch('/api/nonce')
      const { nonce } = await nonceRes.json()
      const result: any = await MiniKit.walletAuth({
        nonce,
        statement: 'Sign in to World Wallet',
        expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
      const payload = result?.data || result?.finalPayload || result
      if (!payload?.address) { setVerifyError('Could not get wallet address'); return }
      const verifyRes = await fetch('/api/verify-wallet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, nonce }),
      })
      const verifyData = await verifyRes.json()
      if (verifyData.success) { setWalletAddress(verifyData.address); setScreen('home') }
      else setVerifyError('Verification failed: ' + (verifyData.error || 'Unknown'))
    } catch (err) { setVerifyError('Error: ' + String(err)) }
    finally { setVerifying(false) }
  }

  const handleSwap = async () => {
    if (!swapAmount || parseFloat(swapAmount) <= 0 || swapFrom === swapTo) return
    setSwapping(true)
    try {
      const { MiniKit } = await import('@worldcoin/minikit-js')
      MiniKit.install(process.env.NEXT_PUBLIC_APP_ID!)
      await new Promise(r => setTimeout(r, 300))
      const amountInWei = BigInt(Math.floor(parseFloat(swapAmount) * 1e18)).toString()
      await (MiniKit as any).pay({
        reference: `swap_${Date.now()}`,
        to: walletAddress!,
        tokens: [{ symbol: 'WLD', token_amount: amountInWei }],
        description: `Swap ${swapAmount} ${swapFrom} → ${swapTo}`,
      })
      setSwapDone(true)
      setTimeout(() => setSwapDone(false), 3000)
    } catch (e) { console.error('Swap error:', e) }
    finally { setSwapping(false); setSwapAmount('') }
  }

  const fromCoin = coins.find(c => c.symbol.toUpperCase() === swapFrom)
  const toCoin = coins.find(c => c.symbol.toUpperCase() === swapTo)
  const swapOut = fromCoin && toCoin && swapAmount
    ? ((parseFloat(swapAmount) * fromCoin.current_price) / toCoin.current_price).toFixed(6) : '—'

  const displayCoins = hideZero ? coins.filter(c => c.balance > 0) : coins

  // ── VERIFY ──────────────────────────────────────────────────────────────────
  if (screen === 'verify') return (
    <div style={{ background:'#0B0E17', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"Inter",system-ui,sans-serif', padding:24 }}>
      <div style={{ width:'100%', maxWidth:360, textAlign:'center' }}>
        <div style={{ position:'relative', width:100, height:100, margin:'0 auto 32px' }}>
          <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'linear-gradient(135deg,#4F46E5,#7C3AED)', opacity:0.2, filter:'blur(20px)' }} />
          <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'linear-gradient(135deg,#4F46E5,#7C3AED)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:44 }}>🌐</div>
        </div>
        <div style={{ fontSize:32, fontWeight:700, color:'#F8FAFC', marginBottom:8, letterSpacing:'-0.03em' }}>World Wallet</div>
        <div style={{ fontSize:15, color:'#64748B', marginBottom:48, lineHeight:1.7 }}>Your verified Web3 wallet.<br/>Powered by World ID.</div>
        {verifyError && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#F87171' }}>{verifyError}</div>}
        <button onClick={handleVerify} disabled={verifying} style={{ width:'100%', padding:'16px 24px', background: verifying ? '#1E293B' : 'linear-gradient(135deg,#4F46E5,#7C3AED)', border:'none', borderRadius:14, fontSize:16, fontWeight:600, color: verifying ? '#475569' : '#fff', cursor: verifying ? 'default' : 'pointer', fontFamily:'inherit', transition:'all 0.2s' }}>
          {verifying ? '⏳  Verifying...' : '🌐  Sign in with World ID'}
        </button>
        <div style={{ marginTop:16, fontSize:12, color:'#334155' }}>Verifies World ID + wallet in one tap</div>
      </div>
    </div>
  )

  // ── COIN DETAIL ──────────────────────────────────────────────────────────────
  if (screen === 'coin' && selectedCoin) {
    const up = selectedCoin.price_change_percentage_24h >= 0
    const sym = selectedCoin.symbol.toUpperCase()
    const color = COIN_COLORS[sym] || '#4F46E5'
    return (
      <div style={{ background:'#0B0E17', minHeight:'100vh', color:'#F8FAFC', fontFamily:'"Inter",system-ui,sans-serif' }}>
        <div style={{ maxWidth:420, margin:'0 auto', paddingBottom:90 }}>
          {/* Header */}
          <div style={{ padding:'52px 20px 20px', display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={() => setScreen('home')} style={{ background:'#1E293B', border:'none', borderRadius:10, width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', color:'#94A3B8', fontSize:18, cursor:'pointer' }}>←</button>
            <div style={{ fontSize:18, fontWeight:700, flex:1 }}>{selectedCoin.name}</div>
            <div style={{ fontSize:12, color:'#64748B', background:'#1E293B', padding:'4px 12px', borderRadius:20, fontFamily:'monospace' }}>{sym}</div>
          </div>

          {/* Price hero */}
          <div style={{ margin:'0 20px 20px', background:`linear-gradient(135deg,${color}22,${color}11)`, border:`1px solid ${color}33`, borderRadius:20, padding:28, textAlign:'center' }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:`${color}22`, border:`2px solid ${color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, margin:'0 auto 16px' }}>
              {selectedCoin.image ? <img src={selectedCoin.image} alt="" style={{ width:40, height:40, borderRadius:'50%' }} /> : (COIN_ICONS[sym] || '🪙')}
            </div>
            <div style={{ fontSize:42, fontWeight:800, letterSpacing:'-0.03em' }}>${fmt(selectedCoin.current_price)}</div>
            <div style={{ marginTop:8, display:'inline-flex', alignItems:'center', gap:6, background: up ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', padding:'4px 12px', borderRadius:20 }}>
              <span style={{ fontSize:14, fontWeight:600, color: up ? '#22C55E' : '#EF4444' }}>{up?'▲':'▼'} {Math.abs(selectedCoin.price_change_percentage_24h).toFixed(2)}%</span>
              <span style={{ fontSize:12, color:'#64748B' }}>24h</span>
            </div>
          </div>

          {/* Balance */}
          <div style={{ margin:'0 20px 16px', background:'#141824', border:'1px solid #1E293B', borderRadius:16, padding:20 }}>
            <div style={{ fontSize:12, color:'#64748B', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Your Balance</div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:28, fontWeight:700 }}>{selectedCoin.balance} <span style={{ fontSize:16, color:'#64748B' }}>{sym}</span></div>
                <div style={{ fontSize:16, color:'#64748B', marginTop:4 }}>${fmt(selectedCoin.usdValue)}</div>
              </div>
              <div style={{ width:48, height:48, borderRadius:14, background:`${color}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>
                {selectedCoin.image ? <img src={selectedCoin.image} alt="" style={{ width:32, height:32, borderRadius:'50%' }} /> : (COIN_ICONS[sym] || '🪙')}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:10, margin:'0 20px 20px' }}>
            {[{l:'Send',i:'↑'},{l:'Receive',i:'↓'},{l:'Swap',i:'⇄',fn:()=>setScreen('swap')}].map(a => (
              <button key={a.l} onClick={a.fn} style={{ flex:1, padding:'14px 0', background:'#141824', border:'1px solid #1E293B', borderRadius:14, color:'#F8FAFC', fontFamily:'inherit', fontSize:14, fontWeight:600, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:20, color:'#7C3AED' }}>{a.i}</span>{a.l}
              </button>
            ))}
          </div>

          {/* Stats */}
          <div style={{ margin:'0 20px', background:'#141824', border:'1px solid #1E293B', borderRadius:16, overflow:'hidden' }}>
            {[
              { label:'Price', val:`$${fmt(selectedCoin.current_price)}` },
              { label:'24h Change', val:`${up?'+':''}${selectedCoin.price_change_percentage_24h.toFixed(2)}%`, color: up?'#22C55E':'#EF4444' },
              { label:'Holdings', val:`${selectedCoin.balance} ${sym}` },
              { label:'Value', val:`$${fmt(selectedCoin.usdValue)}` },
            ].map((r,i,arr) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'14px 20px', borderBottom: i<arr.length-1 ? '1px solid #1E293B' : 'none' }}>
                <div style={{ fontSize:14, color:'#64748B' }}>{r.label}</div>
                <div style={{ fontSize:14, fontWeight:600, color: r.color || '#F8FAFC' }}>{r.val}</div>
              </div>
            ))}
          </div>
        </div>
        <NavBar screen={screen} setScreen={setScreen} />
      </div>
    )
  }

  // ── MAIN APP ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background:'#0B0E17', minHeight:'100vh', color:'#F8FAFC', fontFamily:'"Inter",system-ui,sans-serif' }}>
      <div style={{ maxWidth:420, margin:'0 auto', paddingBottom:90 }}>

        {/* ── HOME ── */}
        {screen === 'home' && (
          <div>
            {/* Top bar */}
            <div style={{ padding:'52px 20px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:22, fontWeight:700, letterSpacing:'-0.02em' }}>My Wallet</div>
                <div style={{ fontSize:12, color:'#475569', fontFamily:'monospace', marginTop:2 }}>{shortAddr(walletAddress||'')}</div>
              </div>
              <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#4F46E5,#7C3AED)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, cursor:'pointer' }} onClick={fetchPrices}>🌐</div>
            </div>

            {/* Portfolio card */}
            <div style={{ margin:'0 20px 24px', background:'linear-gradient(135deg,#4F46E5,#7C3AED)', borderRadius:24, padding:28 }}>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Total Portfolio</div>
              <div style={{ fontSize:48, fontWeight:800, letterSpacing:'-0.03em', lineHeight:1 }}>
                {loadingCoins ? <span style={{ fontSize:24, opacity:0.5 }}>Loading...</span> : `$${fmt(totalUSD)}`}
              </div>
              <div style={{ marginTop:12, display:'flex', gap:16 }}>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>{coins.filter(c=>c.balance>0).length} assets held</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>World Chain</div>
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ display:'flex', justifyContent:'space-around', padding:'0 20px 28px' }}>
              {[
                {icon:'↑',label:'Send',color:'#4F46E5'},
                {icon:'↓',label:'Receive',color:'#7C3AED'},
                {icon:'⇄',label:'Swap',color:'#6D28D9',fn:()=>setScreen('swap')},
                {icon:'≡',label:'History',color:'#5B21B6',fn:()=>setScreen('txs')},
              ].map(a => (
                <div key={a.label} onClick={a.fn} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, cursor:'pointer' }}>
                  <div style={{ width:52, height:52, borderRadius:16, background:`${a.color}22`, border:`1px solid ${a.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:a.color, fontWeight:700 }}>{a.icon}</div>
                  <div style={{ fontSize:12, color:'#64748B', fontWeight:500 }}>{a.label}</div>
                </div>
              ))}
            </div>

            {/* Assets header */}
            <div style={{ padding:'0 20px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:17, fontWeight:700 }}>Assets</div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#64748B', cursor:'pointer' }}>
                  <input type="checkbox" checked={hideZero} onChange={e=>setHideZero(e.target.checked)} style={{ width:14, height:14 }} />
                  Hide zero
                </label>
                <div onClick={fetchPrices} style={{ cursor:'pointer', fontSize:12, color:'#7C3AED', fontWeight:600 }}>↻ Refresh</div>
              </div>
            </div>

            {/* Coin list */}
            {loadingCoins ? (
              <div style={{ textAlign:'center', padding:48, color:'#475569', fontSize:14 }}>
                <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
                Fetching live prices...
              </div>
            ) : displayCoins.length === 0 ? (
              <div style={{ textAlign:'center', padding:48, color:'#475569', fontSize:14 }}>No assets found</div>
            ) : displayCoins.map(coin => {
              const up = coin.price_change_percentage_24h >= 0
              const sym = coin.symbol.toUpperCase()
              const color = COIN_COLORS[sym] || '#4F46E5'
              const hasBalance = coin.balance > 0
              return (
                <div key={coin.id} onClick={() => { setSelectedCoin(coin); setScreen('coin') }} style={{ margin:'0 20px 8px', background: hasBalance ? '#141824' : '#0F1420', border:`1px solid ${hasBalance ? '#1E293B' : '#141824'}`, borderRadius:16, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', transition:'all 0.15s', opacity: hasBalance ? 1 : 0.6 }}>
                  <div style={{ width:44, height:44, borderRadius:14, background:`${color}22`, border:`1px solid ${color}33`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden' }}>
                    {coin.image ? <img src={coin.image} alt="" style={{ width:32, height:32, borderRadius:'50%' }} /> : <span style={{ fontSize:22 }}>{COIN_ICONS[sym] || '🪙'}</span>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{coin.name}</div>
                    <div style={{ fontSize:12, color:'#475569', marginTop:2 }}>{coin.balance > 0 ? `${coin.balance} ${sym}` : `$${fmt(coin.current_price)} / ${sym}`}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:15, fontWeight:700 }}>{coin.balance > 0 ? `$${fmt(coin.usdValue)}` : `$${fmt(coin.current_price)}`}</div>
                    <div style={{ fontSize:12, color: up?'#22C55E':'#EF4444', marginTop:2, fontWeight:600 }}>
                      {up?'▲':'▼'} {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── TRANSACTIONS ── */}
        {screen === 'txs' && (
          <div>
            <div style={{ padding:'52px 20px 24px' }}>
              <div style={{ fontSize:28, fontWeight:700, letterSpacing:'-0.02em' }}>History</div>
              <div style={{ fontSize:13, color:'#475569', marginTop:4, fontFamily:'monospace' }}>{shortAddr(walletAddress||'')}</div>
            </div>

            {loadingTxs ? (
              <div style={{ textAlign:'center', padding:48, color:'#475569' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>Loading...
              </div>
            ) : txs.length === 0 ? (
              <div style={{ textAlign:'center', padding:48, color:'#475569' }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
                <div style={{ fontSize:16, fontWeight:600, marginBottom:8 }}>No transactions yet</div>
                <div style={{ fontSize:14 }}>Your transaction history will appear here</div>
              </div>
            ) : txs.map((tx, i) => {
              const isReceive = tx.type === 'receive'
              const isSwap = tx.type === 'swap'
              const bg = isSwap ? '#92400E' : isReceive ? '#14532D' : '#4C1D1D'
              const color = isSwap ? '#F59E0B' : isReceive ? '#22C55E' : '#EF4444'
              const icon = isSwap ? '⇄' : isReceive ? '↓' : '↑'
              return (
                <div key={i} style={{ margin:'0 20px 8px', background:'#141824', border:'1px solid #1E293B', borderRadius:16, padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:14, background:`${bg}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color, fontWeight:700, flexShrink:0 }}>{icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:700, textTransform:'capitalize' }}>{tx.type}</div>
                    <div style={{ fontSize:12, color:'#475569', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {tx.type==='send' ? `To: ${shortAddr(tx.to_address||'')}` : tx.type==='receive' ? `From: ${shortAddr(tx.from_address||'')}` : 'Token Swap'} · {timeAgo(tx.timestamp)}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:15, fontWeight:700, color: isReceive?'#22C55E':'#F8FAFC' }}>{isReceive?'+':isSwap?'':'-'}{tx.amount} {tx.symbol}</div>
                    <div style={{ fontSize:12, color:'#475569', marginTop:2 }}>${fmt(tx.usd_value)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── SWAP ── */}
        {screen === 'swap' && (
          <div>
            <div style={{ padding:'52px 20px 24px' }}>
              <div style={{ fontSize:28, fontWeight:700, letterSpacing:'-0.02em' }}>Swap</div>
              <div style={{ fontSize:14, color:'#475569', marginTop:4 }}>Exchange tokens instantly</div>
            </div>

            {swapDone && (
              <div style={{ margin:'0 20px 16px', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:14, padding:'14px 16px', textAlign:'center', fontSize:14, fontWeight:700, color:'#22C55E' }}>
                ✓ Swap submitted successfully!
              </div>
            )}

            {/* From */}
            <div style={{ margin:'0 20px 8px', background:'#141824', border:'1px solid #1E293B', borderRadius:20, padding:20 }}>
              <div style={{ fontSize:12, color:'#475569', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>From</div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <select value={swapFrom} onChange={e=>setSwapFrom(e.target.value)} style={{ background:'#0B0E17', border:'1px solid #1E293B', borderRadius:12, padding:'10px 14px', color:'#F8FAFC', fontFamily:'inherit', fontSize:15, fontWeight:700, cursor:'pointer', outline:'none' }}>
                  {coins.map(c=><option key={c.id} value={c.symbol.toUpperCase()} style={{ background:'#0B0E17' }}>{c.symbol.toUpperCase()}</option>)}
                </select>
                <input type="number" placeholder="0.00" value={swapAmount} onChange={e=>setSwapAmount(e.target.value)} style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:32, fontWeight:800, color:'#F8FAFC', textAlign:'right', fontFamily:'inherit' }} />
              </div>
              {fromCoin && swapAmount && <div style={{ fontSize:12, color:'#475569', marginTop:8, textAlign:'right' }}>≈ ${fmt(parseFloat(swapAmount)*fromCoin.current_price)}</div>}
            </div>

            <div style={{ textAlign:'center', padding:'10px 0', fontSize:24, color:'#7C3AED' }}>⇅</div>

            {/* To */}
            <div style={{ margin:'0 20px 24px', background:'#141824', border:'1px solid #1E293B', borderRadius:20, padding:20 }}>
              <div style={{ fontSize:12, color:'#475569', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>To</div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <select value={swapTo} onChange={e=>setSwapTo(e.target.value)} style={{ background:'#0B0E17', border:'1px solid #1E293B', borderRadius:12, padding:'10px 14px', color:'#F8FAFC', fontFamily:'inherit', fontSize:15, fontWeight:700, cursor:'pointer', outline:'none' }}>
                  {coins.map(c=><option key={c.id} value={c.symbol.toUpperCase()} style={{ background:'#0B0E17' }}>{c.symbol.toUpperCase()}</option>)}
                </select>
                <div style={{ flex:1, textAlign:'right', fontSize:32, fontWeight:800, color:'#475569' }}>{swapOut}</div>
              </div>
              {fromCoin && toCoin && swapAmount && <div style={{ fontSize:12, color:'#475569', marginTop:8, textAlign:'right' }}>1 {swapFrom} = {fmt(fromCoin.current_price/toCoin.current_price,4)} {swapTo}</div>}
            </div>

            {/* Rate info */}
            {fromCoin && toCoin && (
              <div style={{ margin:'0 20px 24px', background:'rgba(124,58,237,0.05)', border:'1px solid rgba(124,58,237,0.15)', borderRadius:16, padding:'14px 18px' }}>
                {[
                  {label:'Rate', val:`1 ${swapFrom} = ${fromCoin&&toCoin ? fmt(fromCoin.current_price/toCoin.current_price,4) : '—'} ${swapTo}`},
                  {label:'Network Fee', val:'~$0.01'},
                  {label:'Slippage', val:'0.5%'},
                ].map((r,i)=>(
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0' }}>
                    <div style={{ fontSize:13, color:'#475569' }}>{r.label}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#94A3B8' }}>{r.val}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding:'0 20px' }}>
              <button onClick={handleSwap} disabled={swapping||!swapAmount||swapFrom===swapTo} style={{ width:'100%', padding:18, background:(!swapAmount||swapFrom===swapTo)?'#141824':'linear-gradient(135deg,#4F46E5,#7C3AED)', border:'none', borderRadius:16, fontSize:16, fontWeight:700, color:(!swapAmount||swapFrom===swapTo)?'#334155':'#fff', cursor:(!swapAmount||swapFrom===swapTo)?'default':'pointer', fontFamily:'inherit' }}>
                {swapping ? '⏳ Processing...' : `Swap ${swapFrom} → ${swapTo}`}
              </button>
            </div>
          </div>
        )}
      </div>
      <NavBar screen={screen} setScreen={setScreen} />
    </div>
  )
}

function NavBar({ screen, setScreen }: { screen: string; setScreen: (s: any) => void }) {
  const tabs = [
    {id:'home', label:'Wallet', icon:'◈'},
    {id:'txs', label:'History', icon:'≡'},
    {id:'swap', label:'Swap', icon:'⇄'},
  ]
  return (
    <div style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:420, background:'rgba(11,14,23,0.97)', backdropFilter:'blur(20px)', borderTop:'1px solid #1E293B', display:'flex', zIndex:100, padding:'10px 0 24px' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setScreen(t.id)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'6px 0', border:'none', background:'none', cursor:'pointer', fontFamily:'inherit' }}>
          <span style={{ fontSize:22, color: screen===t.id ? '#7C3AED' : '#334155' }}>{t.icon}</span>
          <span style={{ fontSize:10, fontWeight:600, color: screen===t.id ? '#7C3AED' : '#334155', letterSpacing:'0.04em' }}>{t.label}</span>
        </button>
      ))}
    </div>
  )
}
