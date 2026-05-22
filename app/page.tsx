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
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function WorldWallet() {
  const [screen, setScreen]               = useState<'verify'|'home'|'txs'|'swap'|'coin'>('verify')
  const [verifying, setVerifying]         = useState(false)
  const [verifyError, setVerifyError]     = useState('')
  const [walletAddress, setWalletAddress] = useState<string|null>(null)
  const [coins, setCoins]                 = useState<Coin[]>([])
  const [loadingCoins, setLoadingCoins]   = useState(false)
  const [totalUSD, setTotalUSD]           = useState(0)
  const [selectedCoin, setSelectedCoin]   = useState<Coin|null>(null)
  const [txs, setTxs]                     = useState<Transaction[]>([])
  const [loadingTxs, setLoadingTxs]       = useState(false)
  const [swapFrom, setSwapFrom]           = useState('WLD')
  const [swapTo, setSwapTo]               = useState('USDC')
  const [swapAmount, setSwapAmount]       = useState('')
  const [swapping, setSwapping]           = useState(false)
  const [swapDone, setSwapDone]           = useState(false)

  // ── Fetch live prices + real balances ────────────────────────────────────────
  const fetchPrices = useCallback(async () => {
    if (!walletAddress) return
    setLoadingCoins(true)
    try {
      const [balRes, priceRes] = await Promise.all([
        fetch(`/api/balances?address=${walletAddress}`),
        fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=worldcoin,ethereum,usd-coin,wrapped-bitcoin&order=market_cap_desc'),
      ])
      const { balances } = await balRes.json()
      const priceData: Coin[] = await priceRes.json()

      const balMap: Record<string, number> = {
        'worldcoin':      balances?.WLD  ?? 0,
        'ethereum':       balances?.ETH  ?? 0,
        'usd-coin':       balances?.USDC ?? 0,
        'wrapped-bitcoin':balances?.WETH ?? 0,
      }

      const enriched = priceData.map(c => ({
        ...c,
        balance:  balMap[c.id] ?? 0,
        usdValue: (balMap[c.id] ?? 0) * c.current_price,
      }))

      setCoins(enriched)
      setTotalUSD(enriched.reduce((s, c) => s + c.usdValue, 0))
    } catch {
      // Fallback if CoinGecko rate-limits
      const fallback: Coin[] = [
        { id:'worldcoin',       symbol:'wld',  name:'Worldcoin',       image:'', current_price:2.85,   price_change_percentage_24h: 3.2,  balance:0, usdValue:0 },
        { id:'ethereum',        symbol:'eth',  name:'Ethereum',        image:'', current_price:3240,   price_change_percentage_24h:-1.4,  balance:0, usdValue:0 },
        { id:'usd-coin',        symbol:'usdc', name:'USD Coin',        image:'', current_price:1.00,   price_change_percentage_24h: 0.01, balance:0, usdValue:0 },
        { id:'wrapped-bitcoin', symbol:'wbtc', name:'Wrapped Bitcoin', image:'', current_price:67500,  price_change_percentage_24h: 2.1,  balance:0, usdValue:0 },
      ]
      setCoins(fallback)
      setTotalUSD(0)
    } finally {
      setLoadingCoins(false)
    }
  }, [walletAddress])

  // ── Fetch transactions ────────────────────────────────────────────────────────
  const fetchTxs = useCallback(async () => {
    if (!walletAddress) return
    setLoadingTxs(true)
    try {
      const res = await fetch(`/api/transactions?address=${walletAddress}`)
      const { transactions } = await res.json()
      setTxs(transactions ?? [])
    } catch {
      setTxs([])
    } finally {
      setLoadingTxs(false)
    }
  }, [walletAddress])

  useEffect(() => { if (screen === 'home' || screen === 'swap' || screen === 'coin') fetchPrices() }, [screen, fetchPrices])
  useEffect(() => { if (screen === 'txs') fetchTxs() }, [screen, fetchTxs])

  // ── World ID + Wallet Auth ────────────────────────────────────────────────────
  const handleVerify = async () => {
  setVerifyError('')
  setVerifying(true)
  try {
    const { MiniKit } = await import('@worldcoin/minikit-js')
    MiniKit.install(process.env.NEXT_PUBLIC_APP_ID!)
    await new Promise(r => setTimeout(r, 500))

    const nonceRes = await fetch('/api/nonce')
    const { nonce } = await nonceRes.json()

    const result = await MiniKit.walletAuth({
      nonce,
      statement: 'Sign in to World Wallet',
      expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
    })

    const payload = result?.data || result?.finalPayload || result

    if (!payload || payload.status === 'error') {
      setVerifyError('World App rejected the request')
      return
    }

    const address = payload.address?.toLowerCase()
    if (!address) {
      setVerifyError('Could not get wallet address')
      return
    }

    const verifyRes = await fetch('/api/verify-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, nonce }),
    })
    const verifyData = await verifyRes.json()

    if (verifyData.success) {
      setWalletAddress(verifyData.address)
      setScreen('home')
    } else {
      setVerifyError('Verification failed: ' + (verifyData.error || 'Unknown'))
    }
  } catch (err) {
    setVerifyError('Error: ' + String(err))
  } finally {
    setVerifying(false)
  }
}
  // ── Swap ──────────────────────────────────────────────────────────────────────
  const handleSwap = async () => {
    if (!swapAmount || parseFloat(swapAmount) <= 0 || swapFrom === swapTo) return
    setSwapping(true)
    try {
      const { MiniKit, Tokens, tokenToDecimals } = await import('@worldcoin/minikit-js')
      MiniKit.install(process.env.NEXT_PUBLIC_APP_ID!)
      await new Promise(r => setTimeout(r, 300))
      await MiniKit.pay({
        reference: `swap_${Date.now()}`,
        to: walletAddress!,
        tokens: [{ symbol: Tokens.WLD, token_amount: tokenToDecimals(parseFloat(swapAmount), Tokens.WLD).toString() }],
        description: `Swap ${swapAmount} ${swapFrom} → ${swapTo}`,
      })
      setSwapDone(true)
      setTimeout(() => setSwapDone(false), 3000)
    } catch (e) {
      console.error('Swap error:', e)
    } finally {
      setSwapping(false)
      setSwapAmount('')
    }
  }

  const fromCoin = coins.find(c => c.symbol.toUpperCase() === swapFrom)
  const toCoin   = coins.find(c => c.symbol.toUpperCase() === swapTo)
  const swapOut  = fromCoin && toCoin && swapAmount
    ? ((parseFloat(swapAmount) * fromCoin.current_price) / toCoin.current_price).toFixed(6)
    : '—'

  // ─────────────────────────────────────────────────────────────────────────────
  // VERIFY SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (screen === 'verify') return (
    <div style={{ background:'#060610', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"SF Pro Display",system-ui,sans-serif', padding:24 }}>
      <div style={{ width:'100%', maxWidth:380, textAlign:'center' }}>

        {/* Globe orb */}
        <div style={{ position:'relative', width:120, height:120, margin:'0 auto 32px' }}>
          <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%,#4facfe,#00f2fe,#0070ff)', boxShadow:'0 0 60px rgba(79,172,254,0.5),0 0 120px rgba(0,112,255,0.3)' }} />
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:52 }}>🌐</div>
        </div>

        <div style={{ fontSize:36, fontWeight:800, color:'#fff', marginBottom:8, letterSpacing:'-0.02em' }}>World Wallet</div>
        <div style={{ fontSize:15, color:'rgba(255,255,255,0.4)', marginBottom:48, lineHeight:1.7 }}>
          Your verified crypto wallet.<br/>Powered by World ID.
        </div>

        {verifyError && (
          <div style={{ background:'rgba(255,59,48,0.12)', border:'1px solid rgba(255,59,48,0.3)', borderRadius:14, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#ff3b30' }}>
            {verifyError}
          </div>
        )}

        <button onClick={handleVerify} disabled={verifying} style={{
          width:'100%', padding:'18px 24px',
          background: verifying ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#4facfe,#0070ff)',
          border:'none', borderRadius:18, fontSize:16, fontWeight:700,
          color: verifying ? 'rgba(255,255,255,0.3)' : '#fff',
          cursor: verifying ? 'default' : 'pointer', fontFamily:'inherit',
          boxShadow: verifying ? 'none' : '0 8px 32px rgba(79,172,254,0.4)',
        }}>
          {verifying ? '⏳ Verifying...' : '🌐 Sign in with World ID'}
        </button>

        <div style={{ marginTop:20, fontSize:12, color:'rgba(255,255,255,0.25)' }}>
          Verifies World ID + wallet in one tap
        </div>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // COIN DETAIL SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (screen === 'coin' && selectedCoin) {
    const up = selectedCoin.price_change_percentage_24h >= 0
    return (
      <div style={{ background:'#060610', minHeight:'100vh', color:'#fff', fontFamily:'"SF Pro Display",system-ui,sans-serif', display:'flex', justifyContent:'center' }}>
        <div style={{ width:'100%', maxWidth:420, paddingBottom:100 }}>
          <div style={{ padding:'52px 20px 20px', display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={() => setScreen('home')} style={{ background:'rgba(255,255,255,0.08)', border:'none', borderRadius:10, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:18, cursor:'pointer' }}>←</button>
            <div style={{ fontSize:18, fontWeight:700 }}>{selectedCoin.name}</div>
            <div style={{ marginLeft:'auto', fontSize:12, color:'rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.08)', padding:'4px 10px', borderRadius:20 }}>{selectedCoin.symbol.toUpperCase()}</div>
          </div>

          <div style={{ padding:'0 20px 32px', textAlign:'center' }}>
            {selectedCoin.image && <img src={selectedCoin.image} alt="" style={{ width:56, height:56, borderRadius:'50%', marginBottom:16 }} />}
            <div style={{ fontSize:48, fontWeight:800, letterSpacing:'-0.03em' }}>${fmt(selectedCoin.current_price)}</div>
            <div style={{ marginTop:8, fontSize:16, fontWeight:600, color: up ? '#30d158' : '#ff453a' }}>
              {up ? '▲' : '▼'} {Math.abs(selectedCoin.price_change_percentage_24h).toFixed(2)}% (24h)
            </div>
          </div>

          <div style={{ margin:'0 20px 20px', background:'linear-gradient(135deg,rgba(79,172,254,0.15),rgba(0,112,255,0.08))', border:'1px solid rgba(79,172,254,0.2)', borderRadius:20, padding:24 }}>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:8 }}>Your Balance</div>
            <div style={{ fontSize:36, fontWeight:800 }}>{selectedCoin.balance} <span style={{ fontSize:18, color:'rgba(255,255,255,0.4)' }}>{selectedCoin.symbol.toUpperCase()}</span></div>
            <div style={{ fontSize:20, color:'rgba(255,255,255,0.5)', marginTop:4 }}>${fmt(selectedCoin.usdValue)}</div>
          </div>

          <div style={{ display:'flex', gap:10, margin:'0 20px 24px' }}>
            {['Send','Receive','Swap'].map(a => (
              <button key={a} onClick={() => a === 'Swap' ? setScreen('swap') : null} style={{ flex:1, padding:'14px 0', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:14, color:'#fff', fontFamily:'inherit', fontSize:14, fontWeight:600, cursor:'pointer' }}>{a}</button>
            ))}
          </div>

          <div style={{ margin:'0 20px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:20 }}>
            {[
              { label:'Current Price', val:`$${fmt(selectedCoin.current_price)}` },
              { label:'24h Change',    val:`${up?'+':''}${selectedCoin.price_change_percentage_24h.toFixed(2)}%`, color: up?'#30d158':'#ff453a' },
              { label:'Your Holdings', val:`${selectedCoin.balance} ${selectedCoin.symbol.toUpperCase()}` },
              { label:'Value in USD',  val:`$${fmt(selectedCoin.usdValue)}` },
            ].map((row, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', borderBottom: i<3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ fontSize:14, color:'rgba(255,255,255,0.5)' }}>{row.label}</div>
                <div style={{ fontSize:14, fontWeight:600, color: row.color || '#fff' }}>{row.val}</div>
              </div>
            ))}
          </div>
        </div>
        <NavBar screen={screen} setScreen={setScreen} />
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN APP SCREENS
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background:'#060610', minHeight:'100vh', color:'#fff', fontFamily:'"SF Pro Display",system-ui,sans-serif', display:'flex', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:420, paddingBottom:100 }}>

        {/* ── HOME ───────────────────────────────────────────────────────────── */}
        {screen === 'home' && (
          <div>
            {/* Header */}
            <div style={{ padding:'52px 20px 8px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)', marginBottom:2 }}>Total Balance</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)', fontFamily:'monospace' }}>
                  {walletAddress ? `${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}` : ''}
                </div>
              </div>
              <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#4facfe,#0070ff)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🌐</div>
            </div>

            {/* Total USD */}
            <div style={{ padding:'12px 20px 32px', textAlign:'center' }}>
              <div style={{ fontSize:56, fontWeight:800, letterSpacing:'-0.03em', lineHeight:1 }}>
                {loadingCoins ? '...' : `$${fmt(totalUSD)}`}
              </div>
              <div style={{ marginTop:8, fontSize:13, color:'rgba(255,255,255,0.35)' }}>Portfolio Value in USD</div>
            </div>

            {/* Quick Actions */}
            <div style={{ display:'flex', justifyContent:'center', gap:20, padding:'0 20px 32px' }}>
              {[
                { icon:'↑', label:'Send',    action: () => {} },
                { icon:'↓', label:'Receive', action: () => {} },
                { icon:'⇄', label:'Swap',    action: () => setScreen('swap') },
                { icon:'≡', label:'History', action: () => setScreen('txs') },
              ].map(a => (
                <div key={a.label} onClick={a.action} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, cursor:'pointer' }}>
                  <div style={{ width:54, height:54, borderRadius:16, background:'rgba(79,172,254,0.12)', border:'1px solid rgba(79,172,254,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'#4facfe', fontWeight:700 }}>{a.icon}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', fontWeight:500 }}>{a.label}</div>
                </div>
              ))}
            </div>

            {/* Assets header */}
            <div style={{ padding:'0 20px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:17, fontWeight:700 }}>Assets</div>
              <div onClick={fetchPrices} style={{ cursor:'pointer', fontSize:12, color:'#4facfe', fontWeight:600 }}>↻ Refresh</div>
            </div>

            {/* Coin list */}
            {loadingCoins ? (
              <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.3)', fontSize:14 }}>Loading prices...</div>
            ) : coins.map(coin => {
              const up = coin.price_change_percentage_24h >= 0
              return (
                <div key={coin.id} onClick={() => { setSelectedCoin(coin); setScreen('coin') }} style={{ margin:'0 20px 8px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, cursor:'pointer' }}>
                  {coin.image
                    ? <img src={coin.image} alt="" style={{ width:44, height:44, borderRadius:'50%' }} />
                    : <div style={{ width:44, height:44, borderRadius:'50%', background:'rgba(79,172,254,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, color:'#4facfe' }}>{coin.symbol[0].toUpperCase()}</div>
                  }
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700 }}>{coin.name}</div>
                    <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)', marginTop:2 }}>{coin.balance} {coin.symbol.toUpperCase()}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:15, fontWeight:700 }}>${fmt(coin.usdValue)}</div>
                    <div style={{ fontSize:12, color: up?'#30d158':'#ff453a', marginTop:2, fontWeight:600 }}>
                      {up?'▲':'▼'} {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── TRANSACTIONS ───────────────────────────────────────────────────── */}
        {screen === 'txs' && (
          <div>
            <div style={{ padding:'52px 20px 24px' }}>
              <div style={{ fontSize:28, fontWeight:800 }}>History</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.35)', marginTop:4 }}>
                {walletAddress ? `${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}` : ''}
              </div>
            </div>

            {loadingTxs ? (
              <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.3)' }}>Loading transactions...</div>
            ) : txs.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.3)' }}>No transactions found</div>
            ) : txs.map((tx, i) => {
              const isReceive = tx.type === 'receive'
              const isSwap    = tx.type === 'swap'
              const icon      = isSwap ? '⇄' : isReceive ? '↓' : '↑'
              const iconBg    = isSwap ? 'rgba(255,159,10,0.15)' : isReceive ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)'
              const iconColor = isSwap ? '#ff9f0a' : isReceive ? '#30d158' : '#ff453a'
              return (
                <div key={i} style={{ margin:'0 20px 8px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:'50%', background:iconBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:iconColor, fontWeight:700 }}>{icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, textTransform:'capitalize' }}>{tx.type}</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:2 }}>
                      {tx.type==='send' ? `To: ${tx.to_address?.slice(0,8)}...` : tx.type==='receive' ? `From: ${tx.from_address?.slice(0,8)}...` : 'Token Swap'} · {timeAgo(tx.timestamp)}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:15, fontWeight:700, color: isReceive?'#30d158':'#fff' }}>
                      {isReceive?'+':isSwap?'':'-'}{tx.amount} {tx.symbol}
                    </div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:2 }}>${fmt(tx.usd_value)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── SWAP ───────────────────────────────────────────────────────────── */}
        {screen === 'swap' && (
          <div>
            <div style={{ padding:'52px 20px 24px' }}>
              <div style={{ fontSize:28, fontWeight:800 }}>Swap</div>
              <div style={{ fontSize:14, color:'rgba(255,255,255,0.35)', marginTop:4 }}>Exchange tokens instantly</div>
            </div>

            {swapDone && (
              <div style={{ margin:'0 20px 16px', background:'rgba(48,209,88,0.12)', border:'1px solid rgba(48,209,88,0.3)', borderRadius:14, padding:'14px 16px', textAlign:'center', fontSize:14, fontWeight:700, color:'#30d158' }}>
                ✓ Swap submitted!
              </div>
            )}

            {/* From box */}
            <div style={{ margin:'0 20px 8px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:20, padding:20 }}>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:12 }}>From</div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <select value={swapFrom} onChange={e => setSwapFrom(e.target.value)} style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'10px 14px', color:'#fff', fontFamily:'inherit', fontSize:15, fontWeight:700, cursor:'pointer', outline:'none' }}>
                  {coins.map(c => <option key={c.id} value={c.symbol.toUpperCase()} style={{ background:'#1c1c2e' }}>{c.symbol.toUpperCase()}</option>)}
                </select>
                <input type="number" placeholder="0.00" value={swapAmount} onChange={e => setSwapAmount(e.target.value)}
                  style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:28, fontWeight:800, color:'#fff', textAlign:'right', fontFamily:'inherit' }} />
              </div>
              {fromCoin && swapAmount && (
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:8, textAlign:'right' }}>
                  ≈ ${fmt(parseFloat(swapAmount) * fromCoin.current_price)}
                </div>
              )}
            </div>

            <div style={{ textAlign:'center', padding:'8px 0', fontSize:24, color:'#4facfe' }}>⇅</div>

            {/* To box */}
            <div style={{ margin:'0 20px 24px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:20, padding:20 }}>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:12 }}>To</div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <select value={swapTo} onChange={e => setSwapTo(e.target.value)} style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'10px 14px', color:'#fff', fontFamily:'inherit', fontSize:15, fontWeight:700, cursor:'pointer', outline:'none' }}>
                  {coins.map(c => <option key={c.id} value={c.symbol.toUpperCase()} style={{ background:'#1c1c2e' }}>{c.symbol.toUpperCase()}</option>)}
                </select>
                <div style={{ flex:1, textAlign:'right', fontSize:28, fontWeight:800, color:'rgba(255,255,255,0.4)' }}>{swapOut}</div>
              </div>
              {fromCoin && toCoin && swapAmount && (
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:8, textAlign:'right' }}>
                  1 {swapFrom} = {fmt(fromCoin.current_price / toCoin.current_price, 4)} {swapTo}
                </div>
              )}
            </div>

            {/* Rate info */}
            {fromCoin && toCoin && (
              <div style={{ margin:'0 20px 24px', background:'rgba(79,172,254,0.07)', border:'1px solid rgba(79,172,254,0.15)', borderRadius:16, padding:'14px 18px' }}>
                {[
                  { label:'Rate',         val:`1 ${swapFrom} = ${fromCoin && toCoin ? fmt(fromCoin.current_price/toCoin.current_price,4) : '—'} ${swapTo}` },
                  { label:'Network Fee',  val:'~$0.01' },
                  { label:'Slippage',     val:'0.5%' },
                ].map((row,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0' }}>
                    <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)' }}>{row.label}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.7)' }}>{row.val}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding:'0 20px' }}>
              <button onClick={handleSwap} disabled={swapping || !swapAmount || swapFrom === swapTo} style={{
                width:'100%', padding:18,
                background: (!swapAmount || swapFrom===swapTo) ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#4facfe,#0070ff)',
                border:'none', borderRadius:18, fontSize:16, fontWeight:700,
                color: (!swapAmount || swapFrom===swapTo) ? 'rgba(255,255,255,0.25)' : '#fff',
                cursor: (!swapAmount || swapFrom===swapTo) ? 'default' : 'pointer',
                fontFamily:'inherit',
                boxShadow: (!swapAmount || swapFrom===swapTo) ? 'none' : '0 8px 32px rgba(79,172,254,0.35)',
              }}>
                {swapping ? 'Processing...' : `Swap ${swapFrom} → ${swapTo}`}
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
  return (
    <div style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:420, background:'rgba(6,6,16,0.95)', backdropFilter:'blur(20px)', borderTop:'1px solid rgba(255,255,255,0.08)', display:'flex', zIndex:100, padding:'10px 0 24px' }}>
      {[
        { id:'home', label:'Wallet',  icon:'◈' },
        { id:'txs',  label:'History', icon:'≡' },
        { id:'swap', label:'Swap',    icon:'⇄' },
      ].map(t => (
        <button key={t.id} onClick={() => setScreen(t.id)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'6px 0', border:'none', background:'none', cursor:'pointer', fontFamily:'inherit' }}>
          <span style={{ fontSize:22, color: screen===t.id ? '#4facfe' : 'rgba(255,255,255,0.3)' }}>{t.icon}</span>
          <span style={{ fontSize:10, fontWeight:600, color: screen===t.id ? '#4facfe' : 'rgba(255,255,255,0.3)', letterSpacing:'0.04em' }}>{t.label}</span>
        </button>
      ))}
    </div>
  )
}
