import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDate, formatTime, serviceLabel } from '../../lib/booking'
import { PaymentBadge, StatusBadge } from '../../components/portal'

export default function BookingTable({ bookings, showClient = true, showDriver = true, emptyText = 'No bookings found.' }) {
  const navigate = useNavigate()
  if (!bookings.length) return <p className="p-muted">{emptyText}</p>
  return (
    <div className="p-table-wrap">
      <table className="p-table">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Pickup</th>
            {showClient && <th scope="col">Client</th>}
            <th scope="col">Route</th>
            <th scope="col">Status</th>
            <th scope="col">Payment</th>
            {showDriver && <th scope="col">Driver</th>}
          </tr>
        </thead>
        <tbody>
          {bookings.map(b => (
            <tr key={b.id} onClick={event => { if (!event.target.closest('a')) navigate(`/admin/bookings/${b.order_number}`) }}>
              <td data-label="Order"><Link to={`/admin/bookings/${b.order_number}`} className="p-order-link">{b.order_number}</Link><small>{serviceLabel(b.service_type)}</small></td>
              <td data-label="Pickup"><strong>{formatDate(b.pickup_at)}</strong><small>{formatTime(b.pickup_at)}</small></td>
              {showClient && <td data-label="Client">{b.client_name}<small>{b.client_phone}</small></td>}
              <td data-label="Route" className="p-route-cell">{b.pickup_location} → {b.dropoff_location}</td>
              <td data-label="Status"><StatusBadge status={b.status} /></td>
              <td data-label="Payment"><PaymentBadge booking={b} /></td>
              {showDriver && <td data-label="Driver">{b.driver?.full_name || <span className="p-muted">—</span>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
