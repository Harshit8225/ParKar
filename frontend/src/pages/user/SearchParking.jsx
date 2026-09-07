import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { parkingApi } from '../../api/endpoints';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Pagination, Select, Spinner } from '../../components/ui';
import { money, percent } from '../../utils/format';

/** Bengaluru city centre, used when the browser will not share a location. */
const FALLBACK_LOCATION = { latitude: 12.9757, longitude: 77.6068, label: 'Bengaluru (city centre)' };

const SearchParking = () => {
  const [filters, setFilters] = useState({
    vehicleType: 'four_wheeler',
    radiusKm: 10,
    sortBy: 'distance',
    evCharging: false,
    open24x7: false,
    availableOnly: true,
    minRating: '',
    maxRate: '',
    q: '',
  });
  const [coords, setCoords] = useState(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [locating, setLocating] = useState(true);
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Ask for the browser location once; fall back to the city centre if refused.
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords(FALLBACK_LOCATION);
      setLocationLabel(FALLBACK_LOCATION.label);
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationLabel('Your current location');
        setLocating(false);
      },
      () => {
        setCoords(FALLBACK_LOCATION);
        setLocationLabel(`${FALLBACK_LOCATION.label} - location access was declined`);
        setLocating(false);
      },
      { timeout: 8000 },
    );
  }, []);

  const runSearch = async (targetPage = 1) => {
    if (!coords) return;
    setLoading(true);
    setError('');
    try {
      const params = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        radiusKm: filters.radiusKm,
        vehicleType: filters.vehicleType,
        sortBy: filters.sortBy,
        page: targetPage,
        limit: 9,
      };
      // Only send the flags that are on: the API treats "false" as an explicit filter.
      if (filters.evCharging) params.evCharging = 'true';
      if (filters.open24x7) params.open24x7 = 'true';
      if (filters.availableOnly) params.availableOnly = 'true';
      if (filters.minRating) params.minRating = filters.minRating;
      if (filters.maxRate) params.maxRate = filters.maxRate;
      if (filters.q.trim().length >= 2) params.q = filters.q.trim();

      const { items, pagination: meta } = await parkingApi.search(params);
      setResults(items);
      setPagination(meta);
      setPage(targetPage);
    } catch (err) {
      setError(errorMessage(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Re-run whenever the location resolves or a filter changes.
  useEffect(() => {
    if (coords) runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, filters]);

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Find parking</h1>
        <p className="text-sm text-ink-500">
          {locating ? 'Detecting your location...' : `Searching near ${locationLabel}`}
        </p>
      </div>

      <Card>
        <div className="grid gap-4 lg:grid-cols-4">
          <Field label="Vehicle type">
            <Select value={filters.vehicleType} onChange={update('vehicleType')}>
              <option value="four_wheeler">Four-wheeler (car)</option>
              <option value="two_wheeler">Two-wheeler (bike)</option>
            </Select>
          </Field>
          <Field label="Search radius">
            <Select value={filters.radiusKm} onChange={update('radiusKm')}>
              <option value={2}>Within 2 km</option>
              <option value={5}>Within 5 km</option>
              <option value={10}>Within 10 km</option>
              <option value={25}>Within 25 km</option>
              <option value={50}>Within 50 km</option>
            </Select>
          </Field>
          <Field label="Sort by">
            <Select value={filters.sortBy} onChange={update('sortBy')}>
              <option value="distance">Nearest first</option>
              <option value="rate">Cheapest first</option>
              <option value="rating">Highest rated</option>
              <option value="availability">Most available</option>
            </Select>
          </Field>
          <Field label="Name or area">
            <Input value={filters.q} onChange={update('q')} placeholder="e.g. MG Road" />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <Field label="Minimum rating">
            <Select value={filters.minRating} onChange={update('minRating')}>
              <option value="">Any rating</option>
              <option value="3">3.0 and above</option>
              <option value="4">4.0 and above</option>
              <option value="4.5">4.5 and above</option>
            </Select>
          </Field>
          <Field label="Maximum rate per hour">
            <Input type="number" min="0" value={filters.maxRate} onChange={update('maxRate')} placeholder="Any price" />
          </Field>
          <div className="flex flex-col justify-end gap-2 lg:col-span-2">
            <Checkbox label="Only show facilities with free slots" checked={filters.availableOnly} onChange={update('availableOnly')} />
            <div className="flex flex-wrap gap-4">
              <Checkbox label="EV charging" checked={filters.evCharging} onChange={update('evCharging')} />
              <Checkbox label="Open 24/7" checked={filters.open24x7} onChange={update('open24x7')} />
            </div>
          </div>
        </div>
      </Card>

      {error && <Alert kind="error" onDismiss={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Spinner label="Searching for parking..." />
      ) : results.length === 0 ? (
        <Card>
          <EmptyState
            title="No facilities matched"
            description="Try widening the radius, clearing a filter, or turning off the availability-only option."
            action={
              <Button
                tone="secondary"
                onClick={() =>
                  setFilters((prev) => ({ ...prev, radiusKm: 50, availableOnly: false, evCharging: false, open24x7: false, minRating: '', maxRate: '', q: '' }))
                }
              >
                Reset filters
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.map((lot) => {
              const available = lot.available[filters.vehicleType];
              const rate = lot.hourlyRate[filters.vehicleType];

              return (
                <article key={lot.id} className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-ink-900">{lot.name}</h2>
                        <p className="mt-0.5 truncate text-sm text-ink-500">{lot.location.address}</p>
                      </div>
                      {lot.rating.count > 0 && (
                        <span className="shrink-0 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          {lot.rating.average.toFixed(1)} &#9733;
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {lot.distanceKm !== undefined && <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">{lot.distanceKm} km away</Badge>}
                      {lot.operatingHours.is24x7 ? (
                        <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">Open 24/7</Badge>
                      ) : (
                        <Badge tone={lot.isOpenNow ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}>
                          {lot.isOpenNow ? 'Open now' : 'Closed now'}
                        </Badge>
                      )}
                      {lot.amenities.evCharging && <Badge tone="bg-emerald-50 text-emerald-700 ring-emerald-200">EV charging</Badge>}
                      {lot.amenities.covered && <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">Covered</Badge>}
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-ink-500">From</dt>
                        <dd className="text-sm font-semibold text-ink-900">{money(rate)}/hr</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-ink-500">Free slots</dt>
                        <dd className={`text-sm font-semibold ${available > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {available} of {lot.capacity[filters.vehicleType]}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-ink-500">Occupancy</dt>
                        <dd className="mt-1 flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className={`block h-full rounded-full ${
                                lot.occupancyRate > 0.85 ? 'bg-rose-500' : lot.occupancyRate > 0.6 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, lot.occupancyRate * 100)}%` }}
                            />
                          </span>
                          <span className="text-xs text-ink-500">{percent(lot.occupancyRate * 100, 0)}</span>
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="border-t border-slate-100 p-4">
                    <Link
                      to={`/app/parking/${lot.id}?vehicleType=${filters.vehicleType}`}
                      className={`block rounded-lg px-4 py-2 text-center text-sm font-medium transition ${
                        available > 0
                          ? 'bg-brand-600 text-white hover:bg-brand-700'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {available > 0 ? 'View and book' : 'View details'}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <Card padded={false}>
            <Pagination pagination={pagination} onChange={runSearch} />
          </Card>
        </>
      )}
    </div>
  );
};

export default SearchParking;
