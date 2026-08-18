import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Dashboard(){
  const [user, setUser] = useState(null)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    let mounted = true
    supabase.auth.getSession().then(({ data })=> setUser(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session)=> setUser(session?.user ?? null))

    async function load(){
      setLoading(true)
      const { data, error } = await supabase
        .from('bookings')
        .select('id, start_ts, end_ts, status, deposit_amount, item_id')
        .order('start_ts', {ascending:false})
      if (!mounted) return
      if (error) console.error(error)
      else setBookings(data || [])
      setLoading(false)
    }
    load()

    return ()=> sub.subscription.unsubscribe()
  },[])

  return (
    <div>
      <div className="grid">
        <div className="left">
          <div className="card">
            <h3>Welcome{user ? `, ${user.email.split('@')[0]}` : ''}</h3>
            <p className="muted">Manage your rentals and view your bookings.</p>
          </div>

          <div className="card">
            <h4>Your Bookings</h4>
            {loading ? <div className="empty">Loading bookings...</div> : (
              bookings.length === 0 ? (
                <div className="empty">You have no bookings yet. Browse the catalog to make a booking.</div>
              ) : (
                bookings.map(b => (
                  <div key={b.id} className="booking-item" style={{marginBottom:12}}>
                    <div style={{flex:1}}>
                      <div><strong>Booking #{b.id}</strong></div>
                      <div className="meta">{new Date(b.start_ts).toLocaleString()} → {new Date(b.end_ts).toLocaleString()}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div className="muted">{b.status}</div>
                      <div className="muted">Deposit: ${b.deposit_amount}</div>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        <div className="right">
          <div className="card">
            <h4>Quick Actions</h4>
            <p className="small muted">Staff/Manager: use the backend to perform protected actions (audit, override).</p>
            <button className="btn" style={{width:'100%'}}>Browse Catalog</button>
          </div>

          <div className="card">
            <h4>Activity</h4>
            <div className="muted small">No recent activity</div>
          </div>
        </div>
      </div>
    </div>
  )
}
