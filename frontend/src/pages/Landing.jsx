import { useMemo } from 'react';
import Brand, { BrandWord } from '../components/Brand';
import BookingFlow from '../components/BookingFlow';
import HeroScene from '../components/HeroScene';
import Icon, { IconTile } from '../components/Icon';
import SiteHeader from '../components/SiteHeader';
import { LinkButton } from '../components/ui';
import { homeRouteFor, useAuth } from '../context/AuthContext';

/**
 * Home page. Deliberately short: what ParKar is, and a booking form that runs
 * the whole search-price-pay journey without leaving the page. Everything
 * personal to a driver lives behind the avatar menu instead.
 */

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

/** The small caps label that opens each section below the fold. */
const SectionLabel = ({ children }) => <p className="eyebrow text-accent-600">{children}</p>;

const Landing = () => {
  const { isAuthenticated, user, role } = useAuth();
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <SiteHeader />

      {/* ---------------------------------------------------------- hero ----
          Sized to one viewport minus the header, and vertically centred, so the
          booking form is always above the fold - it is the point of the page.
          4rem is the header at its tallest: py-3 plus the 40px avatar button.

          That promise only holds if the copy above the form stays short, so the
          hero runs to a height budget: headline, one eyebrow, one supporting
          line. Adding a paragraph here costs the form its place on screen. */}
      <section className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden">
        <HeroScene />

        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-6 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto max-w-3xl text-center">
            {isAuthenticated && role === 'user' && (
              <p className="glass mb-4 inline-flex items-center gap-2 rounded-capsule px-4 py-1.5 text-footnote font-medium text-cyan-100">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-capsule bg-cyan-300" />
                Welcome back, {user.name.split(' ')[0]}
              </p>
            )}

            {/* The display size carries its own -0.032em tracking from the type
                scale, which is what stops a 68px headline reading as loose. */}
            <h1 className="text-display uppercase text-white [text-shadow:0_2px_24px_rgba(2,6,23,0.85)]">
              Welcome to <BrandWord tone="light" />
            </h1>

            <p className="eyebrow mt-3.5 text-cyan-200/90">Your smarter, effortless parking solution</p>

            {/* One supporting line, not three. Every extra line of copy here is
                a line that pushes the booking form off the first screen. */}
            <p className="mx-auto mt-4 max-w-xl text-callout leading-relaxed text-white/85 [text-shadow:0_2px_16px_rgba(2,6,23,0.85)]">
              Find, book and park instantly - see which bays are free right now, priced for your exact window before you
              commit.
            </p>
          </div>

          {/* The booking journey runs here, on this page, start to finish. */}
          <BookingFlow />

          <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex flex-col items-center gap-1.5 text-center">
                <span className="glass grid h-9 w-9 place-items-center rounded-control text-cyan-200">
                  <Icon name={item.icon} size={4} />
                </span>
                <span className="text-caption font-semibold text-white/90">{item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------ features ----
          defer-paint: below the fold, so it skips layout and paint until it is
          scrolled near. The reserved intrinsic size means this cannot shift. */}
      <section id="features" className="defer-paint scroll-mt-24 bg-surface py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <SectionLabel>Features</SectionLabel>
            <h2 className="mt-3.5 text-title-1 text-label">
              A parking system that ends at the barrier, not at the booking
            </h2>
          </div>

          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title}>
                <IconTile name={feature.icon} size="lg" />
                <h3 className="mt-5 text-title-3 text-label">{feature.title}</h3>
                <p className="mt-2.5 text-callout leading-relaxed text-label-secondary">{feature.copy}</p>
              </article>
            ))}
          </div>

          <div className="mt-16 flex flex-wrap items-center justify-center gap-3 border-t border-separator pt-12">
            {isAuthenticated ? (
              <LinkButton to={role === 'user' ? '/app' : homeRouteFor(role)} size="lg">
                Go to my dashboard
              </LinkButton>
            ) : (
              <>
                <LinkButton to="/register" size="lg">
                  Create a free account
                </LinkButton>
                <LinkButton to="/login" tone="secondary" size="lg">
                  I already have one
                </LinkButton>
              </>
            )}
          </div>
        </div>
      </section>

      {/* -------------------------------------------- contact and support ---- */}
      <section className="defer-paint bg-canvas py-24">
        <div className="mx-auto grid max-w-6xl gap-16 px-4 sm:px-6 lg:grid-cols-[0.8fr_1fr]">
          <div id="contact" className="scroll-mt-24">
            <SectionLabel>Contact</SectionLabel>
            <h2 className="mt-3.5 text-title-2 text-label">Talk to the ParKar team</h2>
            <p className="mt-3.5 text-callout leading-relaxed text-label-secondary">
              Questions about a booking, or you run a facility and want your slots on the platform? We reply the same
              working day.
            </p>

            <ul className="mt-8 space-y-4">
              {CONTACT_ROWS.map((row) => (
                <li key={row.label} className="flex items-start gap-3.5">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface text-brand-700 ring-1 ring-separator">
                    <Icon name={row.icon} size={4.5} />
                  </span>
                  <div className="min-w-0">
                    <p className="eyebrow text-label-tertiary">{row.label}</p>
                    {row.href ? (
                      <a
                        href={row.href}
                        className="text-callout font-medium text-label transition-colors hover:text-brand-700"
                      >
                        {row.value}
                      </a>
                    ) : (
                      <p className="text-callout font-medium text-label">{row.value}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div id="support" className="scroll-mt-24">
            <SectionLabel>Support</SectionLabel>
            <h2 className="mt-3.5 text-title-2 text-label">Stuck at a gate right now?</h2>
            <p className="mt-3.5 text-callout leading-relaxed text-label-secondary">
              Start here. If your vehicle is at a barrier that has not opened, call the support line and we will clear
              you through manually.
            </p>

            <dl className="mt-8 space-y-3">
              {FAQS.map((item) => (
                <div key={item.q} className="rounded-card border border-separator bg-surface p-4.5">
                  <dt className="flex items-start gap-2.5 text-callout font-semibold text-label">
                    <Icon name="chat" size={4} className="mt-1 text-accent-500" />
                    {item.q}
                  </dt>
                  <dd className="mt-2 pl-7 text-footnote leading-relaxed text-label-secondary">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- footer ---- */}
      <footer className="border-t border-separator bg-surface py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 sm:flex-row sm:px-6">
          <Brand size="sm" />
          <p className="text-caption text-label-tertiary">
            &copy; {year} ParKar &middot; Smart parking with number-plate recognition
          </p>
          <div className="flex gap-5 text-caption font-medium text-label-secondary">
            <a href="#features" className="transition-colors hover:text-brand-700">
              Features
            </a>
            <a href="#contact" className="transition-colors hover:text-brand-700">
              Contact
            </a>
            <a href="#support" className="transition-colors hover:text-brand-700">
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
