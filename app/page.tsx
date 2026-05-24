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

const COMMISSION_WALLET = '0x6b835184085539ee8705b326dca844fb56e8423f'
const COMMISSION_RATE   = 0.10

const WORLD_CHAIN_TOKENS = [
  { symbol:'WLD',  name:'Worldcoin',       coingeckoId:'worldcoin-wld' },
  { symbol:'ETH',  name:'Ethereum',        coingeckoId:'ethereum' },
  { symbol:'USDC', name:'USD Coin',        coingeckoId:'usd-coin' },
  { symbol:'WBTC', name:'Wrapped Bitcoin', coingeckoId:'wrapped-bitcoin' },
  { symbol:'WETH', name:'Wrapped Ether',   coingeckoId:'ethereum' },
  { symbol:'USDT', name:'Tether',          coingeckoId:'tether' },
  { symbol:'DAI',  name:'Dai',             coingeckoId:'dai' },
  { symbol:'OP',   name:'Optimism',        coingeckoId:'optimism' },
]

const COIN_COLORS: Record<string,string> = {
  WLD:'#7C3AED',ETH:'#627EEA',USDC:'#2775CA',WBTC:'#F7931A',
  DAI:'#F5AC37',USDT:'#26A17B',WETH:'#627EEA',OP:'#FF0420',
}
const COIN_ICONS: Record<string,string> = {
  WLD:'🌐',ETH:'⟠',USDC:'💵',WBTC:'₿',DAI:'◈',USDT:'💲',WETH:'⟠',OP:'🔴',
}

function fmt(n: number, d = 2) {
  if (!n || isNaN(n)) return '0.00'
  if (n >= 1000) return n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
  if (n >= 1) return n.toFixed(d)
  if (n >= 0.01) return n.toFixed(4)
  return n.toFixed(6)
}
function shortAddr(a: string) { return a?`${a.slice(0,6)}...${a.slice(-4)}`:'' }
function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const h = Math.floor(diff/3600000), d = Math.floor(diff/86400000)
  if (h<1) return 'just now'
  if (h<24) return `${h}h ago`
  return `${d}d ago`
}

export default function WorldWallet() {
  const [screen,setScreen]             = useState<'verify'|'home'|'txs'|'swap'|'coin'>('verify')
  const [verifying,setVerifying]       = useState(false)
  const [verifyError,setVerifyError]   = useState('')
  const [walletAddress,setWalletAddress] = useState<string|null>(null)
  const [coins,setCoins]               = useState<Coin[]>([])
  const [loadingCoins,setLoadingCoins] = useState(false)
  const [totalUSD,setTotalUSD]         = useState(0)
  const [selectedCoin,setSelectedCoin] = useState<Coin|null>(null)
  const [txs,setTxs]                   = useState<Transaction[]>([])
  const [loadingTxs,setLoadingTxs]     = useState(false)
  const [swapFrom,setSwapFrom]         = useState('WLD')
  const [swapTo,setSwapTo]             = useState('USDC')
  const [swapAmount,setSwapAmount]     = useState('')
  const [swapping,setSwapping]         = useState(false)
  const [swapMsg,setSwapMsg]           = useState('')
  const [hideZero,setHideZero]         = useState(false)

  const fetchPrices = useCallback(async () => {
    if (!walletAddress) return
    setLoadingCoins(true)
    try {
      const [balRes,priceRes] = await Promise.all([
        fetch(`/api/balances?address=${walletAddress}`),
        fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=worldcoin-wld,ethereum,usd-coin,wrapped-bitcoin,tether,dai,optimism&order=market_cap_desc&x_cg_demo_api_key='),
      ])
      const {balances} = await balRes.json()
      const priceData  = await priceRes.json()
      const priceMap: Record<string,any> = {}
      priceData.forEach((p: any) => { priceMap[p.id] = p })

      const enriched: Coin[] = WORLD_CHAIN_TOKENS.map(token => {
        const bal   = balances?.[token.symbol] ?? 0
        const pdata = priceMap[token.coingeckoId]
        const price = pdata?.current_price ?? 0
        const change = pdata?.price_change_percentage_24h ?? 0
        const image  = pdata?.image ?? ''
        return { id:token.symbol, symbol:token.symbol, name:token.name, image, current_price:price, price_change_percentage_24h:change, balance:bal, usdValue:bal*price }
      })

      enriched.sort((a,b) => b.usdValue - a.usdValue || b.current_price - a.current_price)
      setCoins(enriched)
      setTotalUSD(enriched.reduce((s,c) => s+c.usdValue, 0))
    } catch(e) { console.error('fetchPrices',e) }
    finally { setLoadingCoins(false) }
  }, [walletAddress])

  const fetchTxs = useCallback(async () => {
    if (!walletAddress) return
    setLoadingTxs(true)
    try {
      const res = await fetch(`/api/transactions?address=${walletAddress}`)
      const {transactions} = await res.json()
      setTxs(transactions ?? [])
    } catch { setTxs([]) }
    finally { setLoadingTxs(false) }
  }, [walletAddress])

  useEffect(() => { if (screen==='home'||screen==='swap'||screen==='coin') fetchPrices() }, [screen,fetchPrices])
  useEffect(() => { if (screen==='txs') fetchTxs() }, [screen,fetchTxs])

  const handleVerify = async () => {
  setVerifyError('')
  setVerifying(true)
  try {
    const { MiniKit } = await import('@worldcoin/minikit-js')
    MiniKit.install(process.env.NEXT_PUBLIC_APP_ID!)
    await new Promise(r => setTimeout(r, 800))

    const nonceRes = await fetch('/api/nonce')
    const { nonce } = await nonceRes.json()

    let result: any
    try {
      result = await MiniKit.walletAuth({
        nonce,
        statement: 'Sign in to World Wallet',
        expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
    } catch (authErr) {
      setVerifyError('Auth error: ' + String(authErr))
      return
    }

    // Safely extract address from any result shape
    const address =
      result?.data?.address ||
      result?.finalPayload?.address ||
      result?.address ||
      (typeof result === 'object' ? Object.values(result).find((v: any) => typeof v?.address === 'string') as any : null)?.address

    if (!address) {
      setVerifyError('Got result but no address found. Result: ' + JSON.stringify(result)?.slice(0, 200))
      return
    }

    // Save to backend
    const vRes = await fetch('/api/verify-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: result?.data || result?.finalPayload || result,
        nonce,
      }),
    })
    const vData = await vRes.json()

  if (vData.success) {
      setWalletAddress(vData.address)
      setScreen('home')
    } else {
      setVerifyError('Verification failed: ' + (vData.error || 'Unknown'))
    }
  } catch (err) {
    setVerifyError('Error: ' + String(err))
  } finally {
    setVerifying(false)
  }
}
  const handleSwap = async () => {
    if (!swapAmount||parseFloat(swapAmount)<=0||swapFrom===swapTo) return
    setSwapping(true); setSwapMsg('')
    try {
      const {MiniKit} = await import('@worldcoin/minikit-js')
      MiniKit.install(process.env.NEXT_PUBLIC_APP_ID!)
      await new Promise(r => setTimeout(r,300))
      const amount      = parseFloat(swapAmount)
      const commission  = amount * COMMISSION_RATE
      const userAmount  = amount - commission
      const commWei     = BigInt(Math.floor(commission*1e18)).toString()
      await (MiniKit as any).pay({
        reference:`swap_fee_${Date.now()}`,
        to:COMMISSION_WALLET,
        tokens:[{symbol:swapFrom,token_amount:commWei}],
        description:`World Wallet swap fee 10%`,
      })
      setSwapMsg(`✓ Swap of ${userAmount.toFixed(4)} ${swapFrom} → ${swapTo} submitted! Fee: ${commission.toFixed(4)} ${swapFrom}`)
      setTimeout(()=>setSwapMsg(''),5000)
    } catch(e) { setSwapMsg('Swap failed. Try again.') }
    finally { setSwapping(false); setSwapAmount('') }
  }

  const fromCoin = coins.find(c=>c.symbol===swapFrom)
  const toCoin   = coins.find(c=>c.symbol===swapTo)
  const swapOut  = fromCoin&&toCoin&&swapAmount
    ? ((parseFloat(swapAmount)*(1-COMMISSION_RATE)*fromCoin.current_price)/toCoin.current_price).toFixed(6) : '—'
  const displayCoins = hideZero ? coins.filter(c=>c.balance>0) : coins

  if (screen==='verify') return (
    <div style={{background:'#0B0E17',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'"Inter",system-ui,sans-serif',padding:24}}>
      <div style={{width:'100%',maxWidth:360,textAlign:'center'}}>
        <div style={{position:'relative',width:100,height:100,margin:'0 auto 32px'}}>
          <div style={{position:'absolute',inset:-10,borderRadius:'50%',background:'linear-gradient(135deg,#4F46E5,#7C3AED)',opacity:0.15,filter:'blur(24px)'}}/>
          <div style={{position:'absolute',inset:0,borderRadius:'50%',background:'linear-gradient(135deg,#4F46E5,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:46}}>🌐</div>
        </div>
        <div style={{fontSize:34,fontWeight:800,color:'#F8FAFC',marginBottom:8,letterSpacing:'-0.03em'}}>World Wallet</div>
        <div style={{fontSize:15,color:'#64748B',marginBottom:48,lineHeight:1.8}}>Your verified Web3 wallet.<br/>Powered by World ID.</div>
        {verifyError&&<div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:14,padding:'14px 18px',marginBottom:20,fontSize:13,color:'#FCA5A5',lineHeight:1.6}}>{verifyError}</div>}
        <button onClick={handleVerify} disabled={verifying} style={{width:'100%',padding:'18px 24px',background:verifying?'#1E293B':'linear-gradient(135deg,#4F46E5,#7C3AED)',border:'none',borderRadius:16,fontSize:16,fontWeight:700,color:verifying?'#475569':'#fff',cursor:verifying?'default':'pointer',fontFamily:'inherit',boxShadow:verifying?'none':'0 8px 32px rgba(124,58,237,0.4)'}}>
          {verifying?'⏳  Signing in...':'🌐  Sign in with World ID'}
        </button>
        <div style={{marginTop:20,display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:12,color:'#334155'}}>
          <span>✓ World ID</span><span>·</span><span>✓ Wallet</span><span>·</span><span>✓ One tap</span>
        </div>
      </div>
    </div>
  )

  if (screen==='coin'&&selectedCoin) {
    const up=selectedCoin.price_change_percentage_24h>=0,sym=selectedCoin.symbol,col=COIN_COLORS[sym]||'#4F46E5'
    return (
      <div style={{background:'#0B0E17',minHeight:'100vh',color:'#F8FAFC',fontFamily:'"Inter",system-ui,sans-serif'}}>
        <div style={{ width:'100%', maxWidth:420, margin:'0 auto', paddingBottom:90, boxSizing:'border-box' as any }}>
          <div style={{padding:'52px 20px 20px',display:'flex',alignItems:'center',gap:12}}>
            <button onClick={()=>setScreen('home')} style={{background:'#1E293B',border:'none',borderRadius:12,width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',color:'#94A3B8',fontSize:18,cursor:'pointer'}}>←</button>
            <div style={{fontSize:18,fontWeight:700,flex:1}}>{selectedCoin.name}</div>
            <div style={{fontSize:12,color:'#64748B',background:'#1E293B',padding:'4px 12px',borderRadius:20}}>{sym}</div>
          </div>
          <div style={{margin:'0 20px 20px',background:`linear-gradient(135deg,${col}25,${col}10)`,border:`1px solid ${col}35`,borderRadius:22,padding:28,textAlign:'center'}}>
            <div style={{width:60,height:60,borderRadius:'50%',background:`${col}25`,border:`2px solid ${col}45`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,margin:'0 auto 16px',overflow:'hidden'}}>
              {selectedCoin.image?<img src={selectedCoin.image} alt="" style={{width:44,height:44,borderRadius:'50%'}}/>:(COIN_ICONS[sym]||'🪙')}
            </div>
            <div style={{fontSize:44,fontWeight:800,letterSpacing:'-0.04em'}}>${fmt(selectedCoin.current_price)}</div>
            <div style={{marginTop:10,display:'inline-flex',alignItems:'center',gap:6,background:up?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.12)',padding:'5px 14px',borderRadius:20}}>
              <span style={{fontSize:14,fontWeight:700,color:up?'#22C55E':'#EF4444'}}>{up?'▲':'▼'} {Math.abs(selectedCoin.price_change_percentage_24h).toFixed(2)}%</span>
              <span style={{fontSize:12,color:'#64748B'}}>24h</span>
            </div>
          </div>
          <div style={{margin:'0 20px 16px',background:'#141824',border:'1px solid #1E293B',borderRadius:18,padding:22}}>
            <div style={{fontSize:11,color:'#475569',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.08em'}}>Your Balance</div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:30,fontWeight:800}}>{selectedCoin.balance} <span style={{fontSize:16,color:'#475569',fontWeight:500}}>{sym}</span></div>
                <div style={{fontSize:16,color:'#64748B',marginTop:4}}>${fmt(selectedCoin.usdValue)}</div>
              </div>
              <div style={{width:50,height:50,borderRadius:14,background:`${col}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,overflow:'hidden'}}>
                {selectedCoin.image?<img src={selectedCoin.image} alt="" style={{width:34,height:34,borderRadius:'50%'}}/>:(COIN_ICONS[sym]||'🪙')}
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:10,margin:'0 20px 20px'}}>
            {[{l:'Send',i:'↑'},{l:'Receive',i:'↓'},{l:'Swap',i:'⇄',fn:()=>setScreen('swap')}].map(a=>(
              <button key={a.l} onClick={a.fn} style={{flex:1,padding:'14px 0',background:'#141824',border:'1px solid #1E293B',borderRadius:14,color:'#F8FAFC',fontFamily:'inherit',fontSize:14,fontWeight:600,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                <span style={{fontSize:20,color:'#7C3AED'}}>{a.i}</span>{a.l}
              </button>
            ))}
          </div>
          <div style={{margin:'0 20px',background:'#141824',border:'1px solid #1E293B',borderRadius:18,overflow:'hidden'}}>
            {[{label:'Price',val:`$${fmt(selectedCoin.current_price)}`},{label:'24h',val:`${up?'+':''}${selectedCoin.price_change_percentage_24h.toFixed(2)}%`,color:up?'#22C55E':'#EF4444'},{label:'Holdings',val:`${selectedCoin.balance} ${sym}`},{label:'Value',val:`$${fmt(selectedCoin.usdValue)}`}].map((r,i,arr)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'15px 20px',borderBottom:i<arr.length-1?'1px solid #1E293B':'none'}}>
                <div style={{fontSize:14,color:'#64748B'}}>{r.label}</div>
                <div style={{fontSize:14,fontWeight:700,color:r.color||'#F8FAFC'}}>{r.val}</div>
              </div>
            ))}
          </div>
        </div>
        <NavBar screen={screen} setScreen={setScreen}/>
      </div>
    )
  }

  return (
    <div style={{ background:'#0B0E17', minHeight:'100vh', color:'#F8FAFC', fontFamily:'"Inter",system-ui,sans-serif', width:'100%', overflowX:'hidden' as any }}>
      <div style={{maxWidth:420,margin:'0 auto',paddingBottom:90}}>

        {screen==='home'&&(
          <div>
            <div style={{padding:'52px 20px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:22,fontWeight:800,letterSpacing:'-0.02em'}}>My Wallet</div>
                <div style={{fontSize:12,color:'#475569',fontFamily:'monospace',marginTop:2}}>{shortAddr(walletAddress||'')}</div>
              </div>
              <div onClick={fetchPrices} style={{width:42,height:42,borderRadius:'50%',background:'linear-gradient(135deg,#4F46E5,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,cursor:'pointer',boxShadow:'0 4px 16px rgba(124,58,237,0.4)'}}>🌐</div>
            </div>

            <div style={{margin:'0 20px 24px',background:'linear-gradient(135deg,#4F46E5,#7C3AED)',borderRadius:24,padding:28,boxShadow:'0 8px 32px rgba(124,58,237,0.3)'}}>
              <div style={{fontSize:12,color:'rgba(255,255,255,0.6)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.08em'}}>Total Portfolio</div>
              <div style={{fontSize:52,fontWeight:900,letterSpacing:'-0.04em',lineHeight:1}}>
                {loadingCoins?<span style={{fontSize:24,opacity:0.6}}>Loading...</span>:`$${fmt(totalUSD)}`}
              </div>
              <div style={{marginTop:14,fontSize:13,color:'rgba(255,255,255,0.55)'}}>
                {coins.filter(c=>c.balance>0).length} assets · World Chain
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'space-around',padding:'0 20px 28px'}}>
              {[{icon:'↑',label:'Send',color:'#4F46E5'},{icon:'↓',label:'Receive',color:'#7C3AED'},{icon:'⇄',label:'Swap',color:'#6D28D9',fn:()=>setScreen('swap')},{icon:'≡',label:'History',color:'#5B21B6',fn:()=>setScreen('txs')}].map(a=>(
                <div key={a.label} onClick={a.fn} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,cursor:'pointer'}}>
                  <div style={{width:54,height:54,borderRadius:16,background:`${a.color}20`,border:`1px solid ${a.color}40`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:a.color,fontWeight:800}}>{a.icon}</div>
                  <div style={{fontSize:12,color:'#64748B',fontWeight:500}}>{a.label}</div>
                </div>
              ))}
            </div>

            <div style={{padding:'0 20px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:17,fontWeight:800}}>Assets</div>
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#64748B',cursor:'pointer'}}>
                  <input type="checkbox" checked={hideZero} onChange={e=>setHideZero(e.target.checked)}/>Hide zero
                </label>
                <div onClick={fetchPrices} style={{cursor:'pointer',fontSize:12,color:'#7C3AED',fontWeight:700}}>↻ Refresh</div>
              </div>
            </div>

            {loadingCoins?(
              <div style={{textAlign:'center',padding:52,color:'#475569'}}>
                <div style={{fontSize:36,marginBottom:14}}>⏳</div>
                <div style={{fontSize:14}}>Fetching your balances...</div>
              </div>
            ):displayCoins.length===0?(
              <div style={{textAlign:'center',padding:52,color:'#475569'}}>No assets found</div>
            ):displayCoins.map(coin=>{
              const up=coin.price_change_percentage_24h>=0,sym=coin.symbol,col=COIN_COLORS[sym]||'#4F46E5',has=coin.balance>0
              return (
                <div key={coin.id} onClick={()=>{setSelectedCoin(coin);setScreen('coin')}} style={{margin:'0 20px 8px',background:has?'#141824':'#0F1420',border:`1px solid ${has?'#1E293B':'#141824'}`,borderRadius:18,padding:'15px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer',opacity:has?1:0.55}}>
                  <div style={{width:46,height:46,borderRadius:14,background:`${col}20`,border:`1px solid ${col}30`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,overflow:'hidden'}}>
                    {coin.image?<img src={coin.image} alt="" style={{width:32,height:32,borderRadius:'50%'}}/>:<span style={{fontSize:22}}>{COIN_ICONS[sym]||'🪙'}</span>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{coin.name}</div>
                    <div style={{fontSize:12,color:'#475569',marginTop:2}}>{has?`${coin.balance} ${sym}`:`$${fmt(coin.current_price)}`}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:15,fontWeight:700}}>{has?`$${fmt(coin.usdValue)}`:`$${fmt(coin.current_price)}`}</div>
                    <div style={{fontSize:12,color:up?'#22C55E':'#EF4444',marginTop:2,fontWeight:600}}>{up?'▲':'▼'} {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {screen==='txs'&&(
          <div>
            <div style={{padding:'52px 20px 24px'}}>
              <div style={{fontSize:28,fontWeight:800,letterSpacing:'-0.02em'}}>History</div>
              <div style={{fontSize:13,color:'#475569',marginTop:4,fontFamily:'monospace'}}>{shortAddr(walletAddress||'')}</div>
            </div>
            {loadingTxs?(<div style={{textAlign:'center',padding:52,color:'#475569'}}><div style={{fontSize:36,marginBottom:14}}>⏳</div>Loading...</div>
            ):txs.length===0?(<div style={{textAlign:'center',padding:52,color:'#475569'}}><div style={{fontSize:52,marginBottom:14}}>📭</div><div style={{fontSize:16,fontWeight:700,marginBottom:8}}>No transactions yet</div><div style={{fontSize:14}}>Your history will appear here</div></div>
            ):txs.map((tx,i)=>{
              const isR=tx.type==='receive',isS=tx.type==='swap'
              const col=isS?'#F59E0B':isR?'#22C55E':'#EF4444',icon=isS?'⇄':isR?'↓':'↑'
              return (
                <div key={i} style={{margin:'0 20px 8px',background:'#141824',border:'1px solid #1E293B',borderRadius:18,padding:'15px 16px',display:'flex',alignItems:'center',gap:14}}>
                  <div style={{width:46,height:46,borderRadius:14,background:`${col}15`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,color:col,fontWeight:800,flexShrink:0}}>{icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:700,textTransform:'capitalize'}}>{tx.type}</div>
                    <div style={{fontSize:12,color:'#475569',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {tx.type==='send'?`To: ${shortAddr(tx.to_address||'')}`:tx.type==='receive'?`From: ${shortAddr(tx.from_address||'')}` :'Token Swap'} · {timeAgo(tx.timestamp)}
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:15,fontWeight:700,color:isR?'#22C55E':'#F8FAFC'}}>{isR?'+':isS?'':'-'}{tx.amount} {tx.symbol}</div>
                    <div style={{fontSize:12,color:'#475569',marginTop:2}}>${fmt(tx.usd_value)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {screen==='swap'&&(
          <div>
            <div style={{padding:'52px 20px 24px'}}>
              <div style={{fontSize:28,fontWeight:800,letterSpacing:'-0.02em'}}>Swap</div>
              <div style={{fontSize:14,color:'#475569',marginTop:4}}>Exchange tokens instantly</div>
            </div>
            {swapMsg&&<div style={{margin:'0 20px 16px',background:swapMsg.startsWith('✓')?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',border:`1px solid ${swapMsg.startsWith('✓')?'rgba(34,197,94,0.25)':'rgba(239,68,68,0.25)'}`,borderRadius:14,padding:'14px 16px',fontSize:13,fontWeight:600,color:swapMsg.startsWith('✓')?'#22C55E':'#EF4444',lineHeight:1.6}}>{swapMsg}</div>}

            <div style={{margin:'0 20px 8px',background:'#141824',border:'1px solid #1E293B',borderRadius:20,padding:20}}>
              <div style={{fontSize:11,color:'#475569',marginBottom:12,textTransform:'uppercase',letterSpacing:'0.08em'}}>From</div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <select value={swapFrom} onChange={e=>setSwapFrom(e.target.value)} style={{background:'#0B0E17',border:'1px solid #1E293B',borderRadius:12,padding:'10px 14px',color:'#F8FAFC',fontFamily:'inherit',fontSize:15,fontWeight:700,cursor:'pointer',outline:'none'}}>
                  {WORLD_CHAIN_TOKENS.map(t=><option key={t.symbol} value={t.symbol} style={{background:'#0B0E17'}}>{t.symbol}</option>)}
                </select>
                <input type="number" placeholder="0.00" value={swapAmount} onChange={e => setSwapAmount(e.target.value)} style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:24, fontWeight:800, color:'#F8FAFC', textAlign:'right', fontFamily:'inherit', minWidth:0, width:0 }} />
              </div>
              {fromCoin&&swapAmount&&<div style={{fontSize:12,color:'#475569',marginTop:8,textAlign:'right'}}>≈ ${fmt(parseFloat(swapAmount)*fromCoin.current_price)} · Bal: {fromCoin.balance} {swapFrom}</div>}
            </div>

            <div style={{textAlign:'center',padding:'10px 0',fontSize:26,color:'#7C3AED'}}>⇅</div>

            <div style={{margin:'0 20px 24px',background:'#141824',border:'1px solid #1E293B',borderRadius:20,padding:20}}>
              <div style={{fontSize:11,color:'#475569',marginBottom:12,textTransform:'uppercase',letterSpacing:'0.08em'}}>To (after 10% fee)</div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <select value={swapTo} onChange={e=>setSwapTo(e.target.value)} style={{background:'#0B0E17',border:'1px solid #1E293B',borderRadius:12,padding:'10px 14px',color:'#F8FAFC',fontFamily:'inherit',fontSize:15,fontWeight:700,cursor:'pointer',outline:'none'}}>
                  {WORLD_CHAIN_TOKENS.map(t=><option key={t.symbol} value={t.symbol} style={{background:'#0B0E17'}}>{t.symbol}</option>)}
                </select>
                <div style={{flex:1,textAlign:'right',fontSize:32,fontWeight:800,color:'#475569'}}>{swapOut}</div>
              </div>
              {fromCoin&&toCoin&&swapAmount&&<div style={{fontSize:12,color:'#475569',marginTop:8,textAlign:'right'}}>1 {swapFrom} = {fmt(fromCoin.current_price/toCoin.current_price,4)} {swapTo}</div>}
            </div>

            {swapAmount&&parseFloat(swapAmount)>0&&(
              <div style={{margin:'0 20px 24px',background:'rgba(124,58,237,0.06)',border:'1px solid rgba(124,58,237,0.18)',borderRadius:16,padding:'16px 18px'}}>
                <div style={{fontSize:12,fontWeight:700,color:'#7C3AED',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Swap Summary</div>
                {[
                  {label:'You send',     val:`${swapAmount} ${swapFrom}`},
                  {label:'Platform fee', val:`${(parseFloat(swapAmount)*0.1).toFixed(4)} ${swapFrom} (10%)`},
                  {label:'You receive',  val:`${swapOut} ${swapTo}`},
                ].map((r,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0'}}>
                    <div style={{fontSize:13,color:'#475569'}}>{r.label}</div>
                    <div style={{fontSize:13,fontWeight:600,color:r.label==='Platform fee'?'#F59E0B':'#94A3B8'}}>{r.val}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{padding:'0 20px'}}>
              <button onClick={handleSwap} disabled={swapping||!swapAmount||swapFrom===swapTo} style={{width:'100%',padding:18,background:(!swapAmount||swapFrom===swapTo)?'#141824':'linear-gradient(135deg,#4F46E5,#7C3AED)',border:'none',borderRadius:16,fontSize:16,fontWeight:700,color:(!swapAmount||swapFrom===swapTo)?'#334155':'#fff',cursor:(!swapAmount||swapFrom===swapTo)?'default':'pointer',fontFamily:'inherit',boxShadow:(!swapAmount||swapFrom===swapTo)?'none':'0 8px 24px rgba(124,58,237,0.4)'}}>
                {swapping?'⏳ Processing...':`Swap ${swapFrom} → ${swapTo}`}
              </button>
            </div>
          </div>
        )}
      </div>
      <NavBar screen={screen} setScreen={setScreen}/>
    </div>
  )
}

function NavBar({screen,setScreen}:{screen:string;setScreen:(s:any)=>void}) {
  return (
    <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:420,background:'rgba(11,14,23,0.97)',backdropFilter:'blur(24px)',borderTop:'1px solid #1E293B',display:'flex',zIndex:100,padding:'10px 0 24px'}}>
      {[{id:'home',label:'Wallet',icon:'◈'},{id:'txs',label:'History',icon:'≡'},{id:'swap',label:'Swap',icon:'⇄'}].map(t=>(
        <button key={t.id} onClick={()=>setScreen(t.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,padding:'6px 0',border:'none',background:'none',cursor:'pointer',fontFamily:'inherit'}}>
          <span style={{fontSize:22,color:screen===t.id?'#7C3AED':'#334155'}}>{t.icon}</span>
          <span style={{fontSize:10,fontWeight:600,color:screen===t.id?'#7C3AED':'#334155',letterSpacing:'0.04em'}}>{t.label}</span>
        </button>
      ))}
    </div>
  )
}
