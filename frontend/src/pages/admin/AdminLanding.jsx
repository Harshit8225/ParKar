import { Link } from 'react-router-dom';
import HeroBand from '../../components/HeroBand';
import { useAuth } from '../../context/AuthContext';

/**
 * Home page for a platform admin. Like the owner's, this is orientation rather
 * than instrumentation - the live queues and figures are on /admin.
 */

const DUTIES = [
  {
    title: 'Facility approvals',
    copy: 'Nothing reaches a driver unreviewed. Approve a listing, or return it with a reason the owner can act on - capacity that does not match the site, rates with no zone justification, a pin dropped on the wrong building.',
    to: '/admin/facilities',
    action: 'Review the queue',
  },
  {
    title: 'Accounts',
    copy: 'Drivers and owners in one list, with the ability to deactivate an account. A deactivated user keeps their history but cannot sign in or hold a bay.',
    to: '/admin/users',
    action: 'Open users',
  },
  {
    title: 'Money',
    copy: 'Every transaction with its gross, the platform commission and the owner split. The default commission applies platform-wide; individual facilities can be overridden.',
    to: '/admin/transactions',
    action: 'Open transactions',
  },
  {
    title: 'Live activity',
    copy: 'Entries and exits as they are recognised across every facility. The fastest way to tell a single broken camera from a platform-wide problem.',
    to: '/admin/activity',
    action: 'Watch activity',
  },
  {
    title: 'Fraud signals',
    copy: 'Plate mismatches, entries outside a booked window, and duplicate events, grouped by outcome. Most are hardware or timing, and the pattern is what separates the two.',
    to: '/admin/fraud',
    action: 'Open fraud report',
  },
];

const PRINCIPLES = [
  {
    title: 'A rejection needs a reason',
    copy: 'The reason is shown to the owner and is the only guidance they get. "Rejected" without a cause turns into a support call and a resubmission of the same listing.',
  },
  {
    title: 'A flag is not a verdict',
    copy: 'An unreadable plate in the rain and a deliberate mismatch land in the same report. Check whether one facility, one camera, or one hour of the day accounts for the cluster before acting on a driver.',
  },
  {
    title: 'Commission is a platform promise',
    copy: 'Owners price against the split they were onboarded with. Changing the default moves every facility that has no override, so treat it as a policy change rather than a setting.',
  },
];

const AdminLanding = () => {
  const { user } = useAuth();
  const firstName = user?.firstName || String(user?.name || '').trim().split(/\s+/)[0];

  return (
    <div>
      <HeroBand
        tint="violet"
        eyebrow="Platform admin"
        title={firstName ? `Welcome back, ${firstName}` : 'Platform administration'}
        actions={
          <>
            <Link
              to="/admin"
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink-900 shadow-lg shadow-black/20 transition hover:bg-slate-100"
            >
              Open dashboard
            </Link>
            <Link
              to="/admin/facilities"
              className="rounded-xl px-5 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/30 transition hover:bg-white/10"
            >
              Review facilities
            </Link>
          </>
        }
      >
        <p>
          You decide which facilities drivers can see, which accounts stay open, and what the platform takes from each
          booking. This page is what each of those levers does; the dashboard has the current numbers.
        </p>
      </HeroBand>

      <section className="mt-12">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">Your remit</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Five things only you can do</h2>
        </div>

        <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {DUTIES.map((duty) => (
            <article
              key={duty.title}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-violet-200 hover:shadow-md"
            >
              <h3 className="text-base font-semibold text-ink-900">{duty.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">{duty.copy}</p>
              <Link
                to={duty.to}
                className="mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-violet-700 transition hover:text-violet-800"
              >
                {duty.action}
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-3xl bg-ink-900 p-6 text-white sm:p-10">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Judgement calls</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Three that come up constantly</h2>
        </div>

        <div className="mt-9 grid gap-7 md:grid-cols-3">
          {PRINCIPLES.map((item) => (
            <div key={item.title} className="border-l-2 border-violet-400 pl-5">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{item.copy}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminLanding;
