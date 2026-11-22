import { Link } from 'react-router-dom';
import HeroBand from '../../components/HeroBand';
import { useAuth } from '../../context/AuthContext';
import Icon, { IconTile } from '../../components/Icon';
import { LinkButton } from '../../components/ui';

/**
 * Home page for a parking owner.
 *
 * Deliberately not the dashboard: no live numbers, no charts. This explains
 * what the platform does on the owner's behalf and how to get a facility
 * earning - the dashboard at /owner answers "how is it doing right now".
 */

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
            <LinkButton to="/owner" tone="light" size="lg">
              Open dashboard
            </LinkButton>
            <LinkButton to="/owner/lots/new" tone="ghostLight" size="lg">
              Register a facility
            </LinkButton>
          </>
        }
      >
        <p>
          {ownerProfile?.businessName ? `${ownerProfile.businessName} on ParKar. ` : ''}
          Your bays are listed to drivers searching nearby, priced by rules you control, and opened by number-plate
          recognition when a booked vehicle arrives.
        </p>
      </HeroBand>

      {/* ---- What the platform does on the owner's behalf ---- */}
      <section className="mt-12">
        <div className="max-w-2xl">
          <p className="eyebrow text-accent-600">What ParKar runs for you</p>
          <h2 className="mt-3.5 text-title-1 text-label">
            The work between a booking and a barrier
          </h2>
        </div>

        <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((item) => (
            <article
              key={item.title}
              className="tap-lift rounded-card border border-separator bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-emerald-200 hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_12px_32px_-12px_rgba(0,0,0,0.18)]"
            >
              <IconTile name={item.icon} tone="available" size="lg" />
              <h3 className="mt-5 text-title-3 text-label">{item.title}</h3>
              <p className="mt-2 text-footnote leading-relaxed text-label-secondary">{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---- Getting a facility earning ---- */}
      <section className="mt-14 overflow-hidden panel-dark rounded-sheet p-6 sm:p-10">
        <div className="max-w-2xl">
          <p className="eyebrow text-mint">From empty lot to earning</p>
          <h2 className="mt-3.5 text-title-1">Four steps, once per facility</h2>
        </div>

        <ol className="mt-9 grid gap-5 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col rounded-card bg-white/5 p-6 ring-1 ring-inset ring-white/10 transition-colors duration-200 ease-cupertino hover:bg-white/[0.08]"
            >
              <div className="flex items-center gap-3">
                {/* On a panel that is dark in both themes, the numeral needs a
                    colour that does not invert - hence the literal. */}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-capsule bg-mint text-footnote font-bold text-[#1C1C1E]">
                  {index + 1}
                </span>
                <h3 className="text-title-3">{step.title}</h3>
              </div>
              <p className="mt-3.5 flex-1 text-footnote leading-relaxed text-white/70">{step.copy}</p>
              <Link
                to={step.to}
                className="tap mt-5 -ml-2 inline-flex w-fit items-center gap-1.5 rounded-capsule px-2 py-1 text-footnote font-semibold text-mint hover:bg-white/10"
              >
                {step.action}
                <Icon name="forward" size={3.5} />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- Reading the numbers ---- */}
      <section className="mt-14">
        <div className="max-w-2xl">
          <p className="eyebrow text-accent-600">Reading your dashboard</p>
          <h2 className="mt-3.5 text-title-1 text-label">
            What each number is actually telling you
          </h2>
        </div>

        <dl className="mt-9 grid gap-x-10 gap-y-7 md:grid-cols-2">
          {SIGNALS.map((signal) => (
            <div key={signal.metric} className="border-l-2 border-emerald-300 pl-5">
              <dt className="text-footnote font-semibold text-label">{signal.metric}</dt>
              <dd className="mt-1.5 text-footnote leading-relaxed text-label-secondary">{signal.reading}</dd>
            </div>
          ))}
        </dl>

        <Link
          to="/owner"
          className="mt-9 inline-flex items-center gap-2 panel-dark tap rounded-capsule px-5 py-3 text-footnote font-semibold hover:opacity-90"
        >
          See these for my facilities
          <Icon name="forward" size={3.5} />
        </Link>
      </section>

      {/* ---- Owner support ---- */}
      <section className="mt-14 rounded-sheet border border-separator bg-surface p-6 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="eyebrow text-accent-600">Owner support</p>
            <h2 className="mt-3.5 text-title-2 text-label">Something wrong on site?</h2>
            <p className="mt-3 text-footnote leading-relaxed text-label-secondary">
              Barrier stuck, camera offline, or a booking that will not verify? The owner line is staffed during
              facility hours and can release a barrier remotely while you sort the hardware.
            </p>

            <ul className="mt-6 space-y-3">
              <li className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-slate-100 text-label-secondary">
                  <Icon name="phone" size={4} />
                </span>
                <a href="tel:+918047182200" className="text-footnote font-medium text-label hover:text-emerald-700">
                  +91 80 4718 2200
                </a>
              </li>
              <li className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-slate-100 text-label-secondary">
                  <Icon name="mail" size={4} />
                </span>
                <a href="mailto:owners@parkar.app" className="text-footnote font-medium text-label hover:text-emerald-700">
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
              <div key={item.q} className="rounded-control border border-separator bg-slate-50 p-4">
                <p className="text-footnote font-semibold text-label">{item.q}</p>
                <p className="mt-1.5 text-footnote leading-relaxed text-label-secondary">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default OwnerLanding;
