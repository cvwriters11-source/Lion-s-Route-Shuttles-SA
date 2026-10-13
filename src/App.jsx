import React, { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ChevronDown, LogOut, Mail, MapPin, Menu, MessageCircle, Pause, Phone, Play, UserRound, X } from 'lucide-react'
import { contact, heroSlides, reasons, services } from './data'
import { useAuth } from './lib/auth'
import { Loading, RequireRole } from './components/portal'
import { Login, Register } from './pages/AuthPages'

const Book = lazy(() => import('./pages/Book'))
const MyBookings = lazy(() => import('./pages/account/MyBookings'))
const TrackBooking = lazy(() => import('./pages/account/TrackBooking'))
const AdminApp = lazy(() => import('./pages/admin/AdminApp'))
const DriverJobs = lazy(() => import('./pages/driver/DriverJobs'))

const nav = [['Home', '/'], ['About', '/about'], ['Services', '/services'], ['Contact', '/contact']]
const titles = { '/': 'Home', '/about': 'About', '/services': 'Services', '/contact': 'Contact' }
const portalTitles = [['/login', 'Sign in'], ['/register', 'Create account'], ['/book', 'Book online'], ['/account/bookings', 'Track booking'], ['/account', 'My bookings'], ['/admin', 'Admin'], ['/driver', 'Driver jobs']]
const serviceKeys = ['tourism', 'airport_transfer', 'long_distance', 'executive_event']
const headerWhatsAppUrl = `${contact.whatsapp}?text=${encodeURIComponent("Hello Lion's Route Shuttles, I'd like to enquire about a booking.")}`
const roleLinks = {
  client: [['My bookings', '/account'], ['Book a trip', '/book']],
  driver: [['My jobs', '/driver']],
  admin: [['Admin dashboard', '/admin'], ['All bookings', '/admin/bookings'], ['New booking', '/admin/bookings/new']],
}

function WhatsAppIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
}

function RouteEffects() {
  const { pathname } = useLocation()
  useEffect(() => {
    const portalTitle = portalTitles.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1]
    document.title = `${titles[pathname] || portalTitle || 'Page Not Found'} | Lion's Route Shuttles SA`
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

function Brand({ footer = false }) {
  if (footer) {
    return <Link className="footer-brand" to="/" aria-label="Lion's Route Shuttles SA home"><img src="/assets/lions-route-logo.jpg" alt="" /></Link>
  }
  return <Link className="brand" to="/" aria-label="Lion's Route Shuttles SA home"><span className="brand-emblem" aria-hidden="true"><img src="/assets/lions-route-logo.jpg" alt="" /></span><span>LION'S ROUTE<small>SHUTTLES SA</small></span></Link>
}

const roleNames = { admin: 'Administrator', driver: 'Driver', client: 'Client' }

function AccountMenu() {
  const { session, profile, role, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return undefined
    const onPointer = event => { if (!ref.current?.contains(event.target)) setOpen(false) }
    const onKey = event => { if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!session) {
    return <Link className="header-account" to="/login" aria-label="Sign in to your account" title="Sign in"><UserRound aria-hidden="true" /><span>Sign in</span></Link>
  }
  const firstName = profile?.full_name?.split(' ')[0] || 'Account'
  return (
    <div className="header-account-wrap" ref={ref}>
      <button type="button" className={`header-account ${open ? 'is-open' : ''}`} aria-expanded={open} aria-controls="account-menu" aria-label={`Account menu for ${profile?.full_name || 'your account'}`} onClick={() => setOpen(!open)}>
        <UserRound aria-hidden="true" /><span>{firstName}</span><ChevronDown className="header-account-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div id="account-menu" className="account-menu">
          <p className="account-menu-who"><strong>{profile?.full_name || session.user.email}</strong><small>{roleNames[role] || 'Account'} · {session.user.email}</small></p>
          {(roleLinks[role] || []).map(([label, to]) => <Link key={to} to={to}>{label}</Link>)}
          <button type="button" onClick={async () => { await signOut(); navigate('/') }}><LogOut aria-hidden="true" /> Log out</button>
        </div>
      )}
    </div>
  )
}

function MobileAccountLinks() {
  const { session, role, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <nav className="mobile-account" aria-label="Account">
      <Link to="/book" className="mobile-book">Book online</Link>
      {session ? <>
        {(roleLinks[role] || []).filter(([, to]) => to !== '/book').map(([label, to]) => <Link key={to} to={to}>{label}</Link>)}
        <button type="button" onClick={async () => { await signOut(); navigate('/') }}>Log out</button>
      </> : <Link to="/login">Sign in</Link>}
    </nav>
  )
}

function Header() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    document.body.classList.toggle('menu-open', open)
    return () => document.body.classList.remove('menu-open')
  }, [open])
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {nav.map(([name, path]) => <NavLink key={path} to={path}>{name}</NavLink>)}
        </nav>
        <a className="header-whatsapp" href={headerWhatsAppUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp (opens in a new tab)" title="Chat with us on WhatsApp"><WhatsAppIcon /></a>
        <Link className="button button-small header-cta" to="/book">Book online</Link>
        <AccountMenu />
        <button className="menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'}>{open ? <X /> : <Menu />}</button>
      </div>
      <div id="mobile-nav" className={`mobile-nav ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <nav aria-label="Mobile navigation">{nav.map(([name, path], i) => <NavLink key={path} to={path}><span>0{i + 1}</span>{name}</NavLink>)}</nav>
        <MobileAccountLinks />
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <div><Brand footer /><p>Premium private transport and curated journeys across South Africa.</p></div>
        <div><span className="eyebrow">Explore</span>{nav.map(([n, p]) => <Link key={p} to={p}>{n}</Link>)}</div>
        <div><span className="eyebrow">Contact</span><a href={contact.phoneLink}>{contact.phone}</a><a href={`mailto:${contact.email}`}>{contact.email}</a><a href={contact.map} target="_blank" rel="noreferrer">Orange Grove, Johannesburg</a></div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} Lion's Route Shuttles SA</span><span>Premium • Private • Bespoke</span></div>
    </footer>
  )
}

function CTA() {
  return <section className="cta"><span className="eyebrow light">Your journey, our privilege</span><h2>Ready to take<br /><em>the lion's route?</em></h2><p>Tell us where you would like to go. We will take care of the road ahead.</p><Link className="button button-light" to="/contact">Plan your journey <ArrowRight /></Link></section>
}

function ServiceCard({ service, index, detailed = false }) {
  const Icon = service.icon
  return (
    <article className={`service-card ${detailed ? 'service-detailed' : ''}`}>
      <div className="service-image"><img src={service.image} alt="" loading="lazy" /><span>0{index + 1}</span></div>
      <div className="service-copy"><Icon size={22} strokeWidth={1.4} /><span className="eyebrow">{service.label}</span><h3>{service.title}</h3>{detailed && <ul>{service.items.map(item => <li key={item}>{item}</li>)}</ul>}<Link to="/contact">Enquire now <ArrowRight size={17} /></Link></div>
    </article>
  )
}

function PackageCard({ service, index }) {
  const Icon = service.icon
  const descriptions = [
    'Curated sightseeing journeys connecting you with South Africa’s landmarks, culture, and natural beauty.',
    'Private transfers between major airports and your hotel, lodge, or residence.',
    'Comfortable point-to-point travel for cross-country routes and inter-provincial journeys.',
    'Considered transport for important occasions, business gatherings, and private events.',
  ]
  const message = `Hello Lion's Route Shuttles SA,\n\nI would like to request a quote for ${service.title}. Please help me plan my journey.`
  const enquiryUrl = `${contact.whatsapp}?text=${encodeURIComponent(message)}`

  return (
    <article className="package-card">
      <div className="package-card-head">
        <span className="package-number" aria-hidden="true">0{index + 1}</span>
        <span className="package-icon" aria-hidden="true"><Icon strokeWidth={1.35} /></span>
      </div>
      <div className="package-card-content">
        <div className="package-summary">
          <span className="eyebrow">{service.label}</span>
          <h3>{service.title}</h3>
          <p>{descriptions[index]}</p>
        </div>
        <div className="package-details">
          <span className="package-details-label">Routes &amp; services</span>
          <ul aria-label={`${service.title} destinations and services`}>
            {service.items.map(item => <li key={item}><Check aria-hidden="true" /> <span>{item}</span></li>)}
          </ul>
        </div>
      </div>
      <div className="package-card-footer">
        <span>Tailored to your journey</span>
        <div className="package-actions">
          <Link className="package-online" to={`/book?service=${serviceKeys[index]}`} aria-label={`Book ${service.title} online`}>Book online</Link>
          <a className="package-action" href={enquiryUrl} target="_blank" rel="noreferrer" aria-label={`Book Now for ${service.title} on WhatsApp`}>
            Book Now <MessageCircle aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  )
}

function HeroCarousel() {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [interacting, setInteracting] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const heroRef = useRef(null)

  const selectSlide = (next, announce = false) => {
    const index = (next + heroSlides.length) % heroSlides.length
    setActive(index)
    if (announce) setAnnouncement(`Slide ${index + 1} of ${heroSlides.length}: ${heroSlides[index].category}`)
  }

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) setPlaying(false)
    const stopForReducedMotion = event => event.matches && setPlaying(false)
    reducedMotion.addEventListener('change', stopForReducedMotion)
    return () => reducedMotion.removeEventListener('change', stopForReducedMotion)
  }, [])

  useEffect(() => {
    if (!playing || interacting) return undefined
    const timer = window.setInterval(() => setActive(current => (current + 1) % heroSlides.length), 7000)
    return () => window.clearInterval(timer)
  }, [playing, interacting])

  const handleKeyDown = event => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      selectSlide(active - 1, true)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      selectSlide(active + 1, true)
    } else if (event.key === ' ' && event.target === heroRef.current) {
      event.preventDefault()
      setPlaying(value => !value)
    }
  }

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Representative premium transport experiences"
      ref={heroRef}
      tabIndex="0"
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={event => !event.currentTarget.contains(event.relatedTarget) && setInteracting(false)}
    >
      <div className="hero-slides">
        {heroSlides.map((slide, index) => (
          <div
            className={`hero-slide ${index === active ? 'is-active' : ''}`}
            aria-hidden={index !== active}
            key={slide.category}
          >
            <img
              src={slide.image}
              alt={index === active ? slide.alt : ''}
              loading="eager"
              fetchPriority={index === 0 ? 'high' : 'auto'}
              width="1024"
              height="576"
            />
          </div>
        ))}
      </div>
      <div className="hero-shade"></div>
      <div className="hero-content">
        <span className="eyebrow light">Premium • Private • Bespoke</span>
        <h1>Your Premium<br />Travel Partner<br /><em>in South Africa</em></h1>
        <p>Private journeys shaped around you, delivered with warmth, care, and quiet distinction.</p>
        <div className="hero-actions">
          <Link className="button button-light" to="/contact">Plan your journey <ArrowRight /></Link>
          <Link className="text-link light" to="/services">Explore our services</Link>
        </div>
      </div>
      <div className="hero-carousel-ui">
        <div className="hero-caption" aria-hidden="true">
          <span>{String(active + 1).padStart(2, '0')} / {String(heroSlides.length).padStart(2, '0')}</span>
          <strong>{heroSlides[active].category}</strong>
          <small>{heroSlides[active].journey} · Representative concept imagery</small>
        </div>
        <div className="hero-controls">
          <button type="button" onClick={() => selectSlide(active - 1, true)} aria-label="Previous slide"><ArrowLeft /></button>
          <div className="hero-indicators" aria-label="Choose a slide">
            {heroSlides.map((slide, index) => (
              <button
                type="button"
                key={slide.category}
                className={index === active ? 'is-active' : ''}
                aria-label={`Show slide ${index + 1}: ${slide.category}`}
                aria-current={index === active ? 'true' : undefined}
                onClick={() => selectSlide(index, true)}
              ><span></span></button>
            ))}
          </div>
          <button type="button" onClick={() => selectSlide(active + 1, true)} aria-label="Next slide"><ArrowRight /></button>
          <button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}>
            {playing ? <Pause /> : <Play />}
          </button>
        </div>
      </div>
      <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
    </section>
  )
}

function Home() {
  return <main>
    <HeroCarousel />
    <section className="intro split">
      <div><span className="eyebrow">A considered way to travel</span><h2>More than a journey.<br /><em>A South African welcome.</em></h2></div>
      <div><p className="lead">Lion's Route Shuttles SA is a premium shuttle and tour service based in Orange Grove, Johannesburg.</p><p>We provide safe, reliable, and luxurious transport solutions for international tourists, corporate clients, and local guests.</p><Link className="text-link" to="/about">Our story <ArrowRight /></Link></div>
    </section>
    <section className="services-preview"><div className="section-heading"><span className="eyebrow">Travel, tailored</span><h2>Every road has<br /><em>its own story.</em></h2><Link className="text-link" to="/services">View all services <ArrowRight /></Link></div><div className="cards-grid">{services.slice(0, 3).map((s, i) => <ServiceCard service={s} index={i} key={s.title} />)}</div></section>
    <section className="quote-band"><blockquote>“We don't just drive you —<br /><em>we welcome you to South Africa.</em>”</blockquote></section>
    <section className="reasons split"><div><span className="eyebrow">Why travel with us</span><h2>Service that feels<br /><em>effortless.</em></h2></div><ol>{reasons.map((r, i) => <li key={r}><span>0{i + 1}</span>{r}</li>)}</ol></section>
    <CTA />
  </main>
}

function PageHero({ number, label, title, italic, className = '', children, media }) {
  return <section className={`page-hero ${className}`.trim()}><div><span className="eyebrow light">{number} — {label}</span><h1>{title}<br /><em>{italic}</em></h1>{children}</div>{media}</section>
}

const servicesHeroVehicles = [
  {
    category: 'Hyundai Staria',
    image: '/assets/hero/lions-route-staria.jpg',
    alt: "Representative concept image of a professional driver with a white Lion's Route branded Hyundai Staria at a Mpumalanga guest house",
  },
  ...['Executive sedan', 'Luxury SUV'].map(category => heroSlides.find(slide => slide.category === category)),
]

function ServicesHeroFleet() {
  return <figure className="services-hero-fleet">
    <div className="services-hero-gallery">
      {servicesHeroVehicles.map((vehicle, index) => (
        <div className={`services-hero-tile services-hero-tile-${index + 1}`} key={vehicle.category}>
          <img src={vehicle.image} alt={vehicle.alt} width="1600" height="900" loading="eager" decoding="async" fetchPriority={index === 0 ? 'high' : 'auto'} />
          <span aria-hidden="true">{vehicle.category}</span>
        </div>
      ))}
    </div>
    <figcaption>Representative concept imagery · not a depiction of our exact fleet</figcaption>
  </figure>
}

function About() {
  return <main><PageHero number="01" label="About us" title="Driven by pride." italic="Guided by care."><p>Professional, warm, and respectful service across South Africa.</p></PageHero>
    <section className="story split"><div><span className="eyebrow">Our philosophy</span><h2>Taking the lion's route<br /><em>with pride.</em></h2></div><div><p className="lead">Lion's Route Shuttles SA is a premium shuttle and tour service based in Orange Grove, Johannesburg.</p><p>We specialize in providing safe, reliable, and luxurious transport solutions for international tourists, corporate clients, and local guests.</p><p>Our philosophy is rooted in professional, warm, and respectful service — taking the lion's route across South Africa with pride.</p></div></section>
    <section className="about-image"><img src="https://images.unsplash.com/photo-1484318571209-661cf29a69c3?auto=format&fit=crop&w=2000&q=85" alt="South African mountain road through an expansive landscape" /></section>
    <section className="values"><div className="section-heading"><span className="eyebrow">What matters to us</span><h2>The standard is<br /><em>in every detail.</em></h2></div><div className="value-grid">{['Professional','Warm','Respectful'].map((v,i)=><article key={v}><span>0{i+1}</span><h3>{v}</h3><p>{['Thoughtful service, clear communication, and punctual journeys.','A genuine South African welcome, from first contact to final destination.','Your comfort, time, and individual travel needs always come first.'][i]}</p></article>)}</div></section><CTA /></main>
}

function Services() {
  const generalMessage = `Hello Lion's Route Shuttles SA,\n\nI would like to book transport. Please help me choose the right service for my journey.`
  const generalEnquiryUrl = `${contact.whatsapp}?text=${encodeURIComponent(generalMessage)}`
  return <main>
    <PageHero className="services-hero" number="02" label="Our services" title="South Africa," italic="your way." media={<ServicesHeroFleet />}>
      <p>From city arrivals to open-road adventures, every journey is tailored to you.</p>
      <a className="text-link light services-hero-link" href={generalEnquiryUrl} target="_blank" rel="noreferrer">Book on WhatsApp <MessageCircle aria-hidden="true" /></a>
    </PageHero>
    <section className="packages" aria-labelledby="packages-title">
      <div className="packages-intro">
        <div><span className="eyebrow">Choose your journey</span><h2 id="packages-title">Four ways to travel.<br /><em>One considered service.</em></h2></div>
        <p>Explore our transport packages, then request a tailored quote for the route or occasion you have in mind.</p>
      </div>
      <div className="package-grid">{services.map((service, index) => <PackageCard service={service} index={index} key={service.title} />)}</div>
    </section>
    <section className="included split"><div><span className="eyebrow light">Tailored to your plans</span><h2>Tell us the route.<br /><em>We’ll shape the journey.</em></h2></div><div><p>Every enquiry starts with your destination, occasion, and travel needs.</p><a className="button button-light" href={generalEnquiryUrl} target="_blank" rel="noreferrer">Book on WhatsApp <MessageCircle /></a></div></section>
    <CTA />
  </main>
}

function EnquiryForm() {
  const [errors, setErrors] = useState({})
  function submit(e) {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(e.currentTarget))
    const next = {}
    if (!data.name.trim()) next.name = 'Please enter your name.'
    if (!data.phone.trim()) next.phone = 'Please enter a phone number.'
    if (!data.journey.trim()) next.journey = 'Please tell us about your journey.'
    setErrors(next)
    if (Object.keys(next).length) return
    const message = `Hello Lion's Route Shuttles SA,\n\nMy name is ${data.name}.\nPhone: ${data.phone}\nEmail: ${data.email || 'Not provided'}\nService: ${data.service}\n\nJourney details:\n${data.journey}`
    window.open(`${contact.whatsapp}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }
  return <form onSubmit={submit} noValidate>
    <div className="field-row"><label>Full name *<input name="name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} />{errors.name && <span id="name-error" className="error">{errors.name}</span>}</label><label>Phone / WhatsApp *<input name="phone" type="tel" autoComplete="tel" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'phone-error' : undefined} />{errors.phone && <span id="phone-error" className="error">{errors.phone}</span>}</label></div>
    <div className="field-row"><label>Email<input name="email" type="email" autoComplete="email" /></label><label>Service<select name="service">{services.map(s=><option key={s.title}>{s.title}</option>)}</select></label></div>
    <label>Tell us about your journey *<textarea name="journey" rows="5" placeholder="Where are you travelling, and when?" aria-invalid={!!errors.journey} aria-describedby={errors.journey ? 'journey-error' : undefined}></textarea>{errors.journey && <span id="journey-error" className="error">{errors.journey}</span>}</label>
    <button className="button" type="submit">Send via WhatsApp <MessageCircle /></button><p className="form-note">This opens WhatsApp with your enquiry prefilled. No details are stored on this website.</p>
  </form>
}

function Contact() {
  return <main><PageHero number="03" label="Contact" title="Let's plan" italic="your journey."><p>Share your plans with us and we will help shape the road ahead.</p></PageHero><section className="contact-section"><div className="contact-details"><span className="eyebrow">Talk to us</span><h2>We would love<br /><em>to hear from you.</em></h2><div className="contact-links"><a href={contact.phoneLink}><Phone /><span><small>Phone / WhatsApp</small>{contact.phone}</span></a><a href={`mailto:${contact.email}`}><Mail /><span><small>Email</small>{contact.email}</span></a><a href={contact.map} target="_blank" rel="noreferrer"><MapPin /><span><small>Visit us</small>{contact.address}</span></a></div><p><strong>Service area</strong><br />{contact.serviceArea}</p><p className="contact-book-online"><strong>Prefer to book online?</strong><br />Get an order number and track your trip live. <Link to="/book">Book online <ArrowRight aria-hidden="true" /></Link></p></div><EnquiryForm /></section></main>
}

function NotFound() {
  return <main className="not-found"><span className="eyebrow">404 — Lost route</span><h1>This road doesn't<br /><em>go any further.</em></h1><p>Let's get you back to a familiar route.</p><Link className="button button-light" to="/">Return home <ArrowRight /></Link></main>
}

export default function App() {
  const { pathname } = useLocation()
  const appArea = pathname.startsWith('/admin') || pathname.startsWith('/driver')
  return <><RouteEffects /><Header />
    <Suspense fallback={<main className="portal"><Loading /></main>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/services" element={<Services />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/book" element={<Book />} />
        <Route path="/account" element={<RequireRole roles={['client']}><MyBookings /></RequireRole>} />
        <Route path="/account/bookings/:orderNumber" element={<RequireRole roles={['client', 'admin']}><TrackBooking /></RequireRole>} />
        <Route path="/admin/*" element={<RequireRole roles={['admin']}><AdminApp /></RequireRole>} />
        <Route path="/driver" element={<RequireRole roles={['driver']}><DriverJobs /></RequireRole>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
    {!appArea && <Footer />}</>
}
