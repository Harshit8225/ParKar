import { Link } from 'react-router-dom';
import HeroBand from '../../components/HeroBand';
import { useAuth } from '../../context/AuthContext';

/**
 * Home page for a parking owner.
 *
 * Deliberately not the dashboard: no live numbers, no charts. This explains
 * what the platform does on the owner's behalf and how to get a facility
 * earning - the dashboard at /owner answers "how is it doing right now".
 */

const ICONS = {
  camera:
    'M4.5 8.5h3l1.5-2.2h6L16.5 8.5h3A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5Zm7.5 3.2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z',
  chart: 'M4.5 19.5V10m5 9.5V4.5m5 15V13m5 6.5V7.5',
  tag: 'M20.5 12.8 12.8 20.5a1.6 1.6 0 0 1-2.3 0L3.5 13.5V4.5a1 1 0 0 1 1-1h9l7 7a1.6 1.6 0 0 1 0 2.3ZM8 8h.01',
  clock: 'M12 7.5V12l3 2M4.5 12a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0Z',
  wallet:
    'M3.5 8A1.5 1.5 0 0 1 5 6.5h12A1.5 1.5 0 0 1 18.5 8m-15 0v10A1.5 1.5 0 0 0 5 19.5h14a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 1 3.5 8Zm13 4.5h.01',
  shield: 'M12 3.2 5 6v6c0 4.2 2.9 7.3 7 8.8 4.1-1.5 7-4.6 7-8.8V6l-7-2.8Zm-2.4 8.6 2 2 3.4-3.6',
  mail: 'M3.5 7.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-9Zm0 .5 8.5 6 8.5-6',
  phone:
    'M7 3.5 9.5 8 7.8 9.8a12 12 0 0 0 4.4 4.4L14 12.5l4.5 2.5v3.5A1.5 1.5 0 0 1 17 20C10.4 19.4 4.6 13.6 4 7a1.5 1.5 0 0 1 1.5-1.6H7V3.5Z',
};

const Icon = ({ name, className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
    <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CAPABILITIES = [
  {
    icon: 'camera',
    title: 'The gate runs itself',
    copy: 'A camera at the entrance reads the number plate and matches it against the reservation, then opens the barrier. No attendant checking printouts, and no queue at the exit while someone works out a fare.',
  },
  {
    icon: 'tag',
    title: 'Pricing that follows demand',
    copy: 'Rates move with occupancy, peak windows, your location zone and the day of the week. Every factor is yours to set, the combined multiplier is clamped to a range you choose, and you can simulate a full day before publishing.',
  },
  {
    icon: 'clock',
    title: 'Overstay collected, not chased',
    copy: 'When a vehicle leaves later than booked, the extra time is metered from the real exit, a grace period is applied, and the charge is raised against the driver automatically. It lands in your revenue like any other payment.',
  },
  {
    icon: 'chart',
    title: 'Occupancy you can trust',
    copy: 'Free slots are counted per vehicle type as bookings and live sessions change, so drivers only see bays that exist. If a counter ever drifts after manual intervention, a recount reconciles it against open sessions.',
  },
  {
    icon: 'wallet',
    title: 'Transparent settlement',
    copy: 'Every transaction shows gross, the platform commission, and your net earning. Payout details live on your business profile, and the earnings summary breaks the split down for any date range.',
  },
  {
    icon: 'shield',
    title: 'A vetted marketplace',
    copy: 'Each facility is reviewed by a platform admin before it goes live. That gate is why drivers book here without calling ahead - and it applies to your competitors as much as to you.',
  },
];

const STEPS = [
  {
    title: 'Register the facility',
    copy: 'Address and map position, capacity and hourly rate per vehicle type, opening hours, and the amenities drivers filter on: EV charging, covered, security, CCTV.',
    to: '/owner/lots/new',
    action: 'Register a facility',
  },
  {
    title: 'Wait for review',
    copy: 'A platform admin approves the listing or returns it with a reason. Nothing is visible to drivers until it is approved, so take the time to get capacity and rates right.',
    to: '/owner/lots',
    action: 'See my facilities',
  },
  {
    title: 'Tune the pricing rules',
    copy: 'Set occupancy tiers, peak windows, the zone premium and weekday multipliers. Run the simulation across a full day and check the curve before you commit to it.',
    to: '/owner/lots',
    action: 'Open pricing rules',
  },
  {
    title: 'Run the gate',
    copy: 'Point the entry and exit cameras at the terminal. Plates that cannot be read are entered by hand, and every decision is logged against the booking.',
    to: '/owner/gate',
    action: 'Open gate terminal',
  },
];

const SIGNALS = [
  {
    metric: 'Occupancy rate',
    reading: 'Sitting near 100% through the day means you are under-priced at peak, not that you are full. Raise the top occupancy tier before you add capacity.',
  },
  {
    metric: 'Entries by hour',
    reading: 'Shows when vehicles actually arrive, which is rarely when you assume. Line your peak windows up with this curve rather than with office hours.',
  },
  {
    metric: 'Average parking time',
    reading: 'Short average stays with high turnover favour a higher hourly rate; long stays favour keeping the rate flat so drivers commit to a longer booking.',
  },
  {
    metric: 'Overstay rate',
    reading: 'A high rate is a signal that drivers are under-booking their window, not that they are dishonest. It is revenue, but it also means bays are held longer than planned.',
  },
];

const OwnerLanding = () => {
  const { user, ownerProfile } = useAuth();
  const firstName = user?.firstName || String(user?.name || '').trim().split(/\s+/)[0];

  return (
    <div>
      <HeroBand
        tint="teal"
        eyebrow="Parking owner"
        title={firstName ? `Welcome back, ${firstName}` : 'Run your parking, not your barrier'}
        actions={
          <>
            <Link
              to="/owner"
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink-900 shadow-lg shadow-black/20 transition hover:bg-slate-100"
            >
              Open dashboard
            </Link>
            <Link
              to="/owner/lots/new"
              className="rounded-xl px-5 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/30 transition hover:bg-white/10"
            >
              Register a facility
            </Link>
          </>
        }
      >
        <p>
          {ownerProfile?.businessName ? `${ownerProfile.businessName} on ParKar. ` : ''}
          Your bays are listed to drivers searching nearby, priced by rules you control, and opened by number-plate
          recognition when a booked vehicle arrives. This page is the how and why; live numbers are on your dashboard.
        </p>
      </HeroBand>

      {/* ---- What the platform does on the owner's behalf ---- */}
      <section className="mt-12">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">What ParKar runs for you</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            The work between a booking and a barrier
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            Most of what follows happens without anyone on site touching it. Knowing where the seams are is what lets
            you price and staff a facility well.
          </p>
        </div>

        <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <Icon name={item.icon} className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-ink-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---- Getting a facility earning ---- */}
      <section className="mt-14 overflow-hidden rounded-3xl bg-ink-900 p-6 text-white sm:p-10">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">From empty lot to earning</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Four steps, once per facility</h2>
        </div>

        <ol className="mt-9 grid gap-5 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col rounded-2xl bg-white/5 p-6 ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.08]"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-400 text-sm font-bold text-ink-900">
                  {index + 1}
                </span>
                <h3 className="text-base font-semibold">{step.title}</h3>
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-white/70">{step.copy}</p>
              <Link
                to={step.to}
                className="mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
              >
                {step.action}
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- Reading the numbers ---- */}
      <section className="mt-14">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">Reading your dashboard</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            What each number is actually telling you
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            The dashboard reports these for any date range. The interpretation is the part that is easy to get wrong.
          </p>
        </div>

        <dl className="mt-9 grid gap-x-10 gap-y-7 md:grid-cols-2">
          {SIGNALS.map((signal) => (
            <div key={signal.metric} className="border-l-2 border-emerald-300 pl-5">
              <dt className="text-sm font-semibold text-ink-900">{signal.metric}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink-500">{signal.reading}</dd>
            </div>
          ))}
        </dl>

        <Link
          to="/owner"
          className="mt-9 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          See these for my facilities
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </section>

      {/* ---- Owner support ---- */}
      <section className="mt-14 rounded-3xl border border-slate-200 bg-white p-6 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">Owner support</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink-900">Something wrong on site?</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              Barrier stuck, camera offline, or a booking that will not verify? The owner line is staffed during
              facility hours and can release a barrier remotely while you sort the hardware.
            </p>

            <ul className="mt-6 space-y-3">
              <li className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-ink-700">
                  <Icon name="phone" className="h-4 w-4" />
                </span>
                <a href="tel:+918047182200" className="text-sm font-medium text-ink-900 hover:text-emerald-700">
                  +91 80 4718 2200
                </a>
              </li>
              <li className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-ink-700">
                  <Icon name="mail" className="h-4 w-4" />
                </span>
                <a href="mailto:owners@parkar.app" className="text-sm font-medium text-ink-900 hover:text-emerald-700">
                  owners@parkar.app
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            {[
              {
                q: 'A plate was misread and the barrier stayed shut.',
                a: 'Use manual plate entry on the gate terminal. The booking is verified the same way and the event is logged, so the session still bills correctly.',
              },
              {
                q: 'My free-slot count looks wrong.',
                a: 'Run a recount from the facility page. It reconciles the counters against open sessions and confirmed bookings.',
              },
              {
                q: 'When do I get paid?',
                a: 'Payments settle to the platform first, commission is deducted, and your net is what the earnings summary shows. Keep your payout details current on the business profile.',
              },
              {
                q: 'My facility was returned unapproved.',
                a: 'The admin leaves a reason on the listing. Fix what it names and the facility goes back into the queue automatically.',
              },
            ].map((item) => (
              <div key={item.q} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-ink-900">{item.q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default OwnerLanding;
