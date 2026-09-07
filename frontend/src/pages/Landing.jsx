import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Brand, { BrandWord } from '../components/Brand';
import BookingFlow from '../components/BookingFlow';
import HeroScene from '../components/HeroScene';
import SiteHeader from '../components/SiteHeader';
import { homeRouteFor, useAuth } from '../context/AuthContext';

/**
 * Home page. Deliberately short: what ParKar is, and a booking form that runs
 * the whole search-price-pay journey without leaving the page. Everything
 * personal to a driver lives behind the avatar menu instead.
 */

const ICON_PATHS = {
  radar:
    'M12 12v-8m0 8 5.7 5.7M4.2 12a7.8 7.8 0 1 0 15.6 0 7.8 7.8 0 0 0-15.6 0Zm3.4 0a4.4 4.4 0 1 0 8.8 0 4.4 4.4 0 0 0-8.8 0Z',
  bolt: 'M13.5 3 5.5 13.5h5L9.5 21l8-10.5h-5L13.5 3Z',
  shield: 'M12 3.2 5 6v6c0 4.2 2.9 7.3 7 8.8 4.1-1.5 7-4.6 7-8.8V6l-7-2.8Zm-2.4 8.6 2 2 3.4-3.6',
  pin: 'M12 21s6.5-5.3 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.7 12 21 12 21Zm0-8.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z',
  camera:
    'M4.5 8.5h3l1.5-2.2h6L16.5 8.5h3A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Zm7.5 3.2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z',
  tag: 'M20.5 12.8 12.8 20.5a1.6 1.6 0 0 1-2.3 0L3.5 13.5V4.5a1 1 0 0 1 1-1h9l7 7a1.6 1.6 0 0 1 0 2.3ZM8 8h.01',
  clock: 'M12 7.5V12l3 2M4.5 12a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0Z',
  mail: 'M3.5 7.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-9Zm0 .5 8.5 6 8.5-6',
  phone:
    'M7 3.5 9.5 8 7.8 9.8a12 12 0 0 0 4.4 4.4L14 12.5l4.5 2.5v3.5A1.5 1.5 0 0 1 17 20C10.4 19.4 4.6 13.6 4 7a1.5 1.5 0 0 1 1.5-1.6H7V3.5Z',
  chat: 'M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2v-10Z',
};

const Icon = ({ name, className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
    <path d={ICON_PATHS[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const HIGHLIGHTS = [
  { icon: 'radar', title: 'Real-time Availability' },
  { icon: 'bolt', title: 'Instant Confirmation' },
  { icon: 'shield', title: 'Secure Payments' },
  { icon: 'pin', title: 'Navigate Easily' },
];

const FEATURES = [
  {
    icon: 'camera',
    title: 'Number-plate entry',
    copy: 'Cameras at the gate read your plate and match it to your booking, so the barrier just opens. Nothing to scan, nothing to print.',
  },
  {
    icon: 'tag',
    title: 'Pricing you can audit',
    copy: 'Rates move with occupancy, peak hours and zone, and every quote shows which multiplier applied before you pay a rupee.',
  },
  {
    icon: 'clock',
    title: 'Overstay handled for you',
    copy: 'Stay past your window and the extra time is metered from your real exit, after a grace period, then billed automatically.',
  },
];

const CONTACT_ROWS = [
  { icon: 'mail', label: 'Email', value: 'hello@parkar.app', href: 'mailto:hello@parkar.app' },
  { icon: 'phone', label: 'Phone', value: '+91 80 4718 2200', href: 'tel:+918047182200' },
  { icon: 'pin', label: 'Office', value: 'Koramangala, Bengaluru 560034' },
];

const FAQS = [
  {
    q: 'The camera did not recognise my plate.',
    a: 'The gate operator can verify your booking by hand, and support can release the barrier remotely. Keep your booking open on your phone.',
  },
  {
    q: 'I stayed longer than I booked.',
    a: 'A grace period applies, then the extra time is charged at the facility overstay rate. It shows on your dashboard and can be paid there.',
  },
  {
    q: 'Can I cancel a booking?',
    a: 'Not today - the bay is held for you the moment you pay, so bookings are neither cancellable nor refundable.',
  },
  {
    q: 'How is my payment handled?',
    a: 'Checkout runs through Razorpay. Card and UPI details never reach ParKar servers.',
  },
];

const Landing = () => {
  const { isAuthenticated, user, role } = useAuth();
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <SiteHeader />

      {/* ---------------------------------------------------------- hero ---- */}
      <section className="relative isolate overflow-hidden">
        <HeroScene />

        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            {isAuthenticated && role === 'user' && (
              <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-cyan-100 ring-1 ring-inset ring-white/20 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                Welcome back, {user.name.split(' ')[0]}
              </p>
            )}

            <h1 className="text-[2.1rem] font-extrabold uppercase leading-[1.05] tracking-tight text-white [text-shadow:0_2px_24px_rgba(2,6,23,0.85)] sm:text-6xl">
              Welcome to <BrandWord tone="light" />
            </h1>

            <p className="mt-4 text-sm font-medium uppercase tracking-[0.22em] text-cyan-200/90 sm:text-base">
              Your smarter, effortless parking solution
            </p>

            <p className="mx-auto mt-8 max-w-2xl text-lg font-semibold leading-snug text-white/95 [text-shadow:0_2px_16px_rgba(2,6,23,0.85)] sm:text-2xl">
              Revolutionize your parking experience.
              <br className="hidden sm:block" /> Find, book, and park instantly.
            </p>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-slate-200/85 sm:text-base">
              ParKar shows you which bays are actually free right now, prices your exact window before you commit, and
              opens the barrier by reading your number plate when you arrive.
            </p>
          </div>

          {/* The booking journey runs here, on this page, start to finish. */}
          <div className="mt-12">
            <BookingFlow />
          </div>

          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex flex-col items-center gap-2 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-cyan-200 ring-1 ring-inset ring-white/20 backdrop-blur">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-white/90 sm:text-sm">{item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------ features ---- */}
      <section id="features" className="scroll-mt-24 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">Features</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
              A parking system that ends at the barrier, not at the booking
            </h2>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title}>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon name={feature.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{feature.copy}</p>
              </article>
            ))}
          </div>

          {!isAuthenticated && (
            <div className="mt-14 flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-10">
              <Link
                to="/register"
                className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700"
              >
                Create a free account
              </Link>
              <Link
                to="/login"
                className="rounded-xl px-6 py-3 text-sm font-semibold text-ink-700 ring-1 ring-slate-300 transition hover:bg-slate-50"
              >
                I already have one
              </Link>
            </div>
          )}
          {isAuthenticated && (
            <div className="mt-14 flex justify-center border-t border-slate-100 pt-10">
              <Link
                to={role === 'user' ? '/app' : homeRouteFor(role)}
                className="rounded-xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Go to my dashboard
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* -------------------------------------------- contact and support ---- */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 lg:grid-cols-[0.8fr_1fr]">
          <div id="contact" className="scroll-mt-24">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">Contact</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink-900">Talk to the ParKar team</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              Questions about a booking, or you run a facility and want your slots on the platform? We reply the same
              working day.
            </p>

            <ul className="mt-7 space-y-4">
              {CONTACT_ROWS.map((row) => (
                <li key={row.label} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-brand-700 ring-1 ring-slate-200">
                    <Icon name={row.icon} className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{row.label}</p>
                    {row.href ? (
                      <a href={row.href} className="text-sm font-medium text-ink-900 transition hover:text-brand-700">
                        {row.value}
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-ink-900">{row.value}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div id="support" className="scroll-mt-24">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">Support</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink-900">Stuck at a gate right now?</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              Start here. If your vehicle is at a barrier that has not opened, call the support line and we will clear
              you through manually.
            </p>

            <dl className="mt-7 space-y-3">
              {FAQS.map((item) => (
                <div key={item.q} className="rounded-xl border border-slate-200 bg-white p-4">
                  <dt className="flex items-start gap-2.5 text-sm font-semibold text-ink-900">
                    <Icon name="chat" className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" />
                    {item.q}
                  </dt>
                  <dd className="mt-1.5 pl-6.5 text-sm leading-relaxed text-ink-500">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- footer ---- */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <Brand size="sm" />
          <p className="text-xs text-ink-500">
            &copy; {year} ParKar &middot; Smart parking with number-plate recognition
          </p>
          <div className="flex gap-5 text-xs font-medium text-ink-500">
            <a href="#features" className="transition hover:text-brand-700">
              Features
            </a>
            <a href="#contact" className="transition hover:text-brand-700">
              Contact
            </a>
            <a href="#support" className="transition hover:text-brand-700">
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
