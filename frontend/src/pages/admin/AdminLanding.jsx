import { Link } from 'react-router-dom';
import HeroBand from '../../components/HeroBand';
import Icon from '../../components/Icon';
import { LinkButton } from '../../components/ui';
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
            <LinkButton to="/admin" tone="light" size="lg">
              Open dashboard
            </LinkButton>
            <LinkButton to="/admin/facilities" tone="ghostLight" size="lg">
              Review facilities
            </LinkButton>
          </>
        }
      >
        <p>
          You decide which facilities drivers can see, which accounts stay open, and what the platform takes from each
          booking.
        </p>
      </HeroBand>

      <section className="mt-12">
        <div className="max-w-2xl">
          <p className="eyebrow text-accent-600">Your remit</p>
          <h2 className="mt-3.5 text-title-1 text-label">Five things only you can do</h2>
        </div>

        <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {DUTIES.map((duty) => (
            <article
              key={duty.title}
              className="tap-lift flex flex-col rounded-card border border-separator bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-violet-200 hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_12px_32px_-12px_rgba(0,0,0,0.18)]"
            >
              <h3 className="text-title-3 text-label">{duty.title}</h3>
              <p className="mt-2 flex-1 text-footnote leading-relaxed text-label-secondary">{duty.copy}</p>
              <Link
                to={duty.to}
                className="tap mt-5 -ml-2 inline-flex w-fit items-center gap-1.5 rounded-capsule px-2 py-1 text-footnote font-semibold text-violet-700 hover:bg-violet-50"
              >
                {duty.action}
                <Icon name="forward" size={3.5} />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14 panel-dark rounded-sheet p-6 sm:p-10">
        <div className="max-w-2xl">
          <p className="eyebrow text-violet-300">Judgement calls</p>
          <h2 className="mt-3.5 text-title-1">Three that come up constantly</h2>
        </div>

        <div className="mt-9 grid gap-7 md:grid-cols-3">
          {PRINCIPLES.map((item) => (
            <div key={item.title} className="border-l-2 border-violet-400 pl-5">
              <h3 className="text-headline">{item.title}</h3>
              <p className="mt-2 text-footnote leading-relaxed text-white/70">{item.copy}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminLanding;
