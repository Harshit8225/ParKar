import client from './client';

const unwrap = (response) => response.data.data;
const unwrapList = (response) => ({
  items: response.data.data,
  pagination: response.data.pagination,
  summary: response.data.summary,
  byResult: response.data.byResult,
  flaggedEvents: response.data.flaggedEvents,
});

export const authApi = {
  register: (payload) => client.post('/auth/register', payload).then(unwrap),
  login: (payload) => client.post('/auth/login', payload).then(unwrap),
  me: () => client.get('/auth/me').then(unwrap),
  updateProfile: (payload) => client.patch('/auth/me', payload).then(unwrap),
  changePassword: (payload) => client.post('/auth/change-password', payload).then(unwrap),

  /** Ticket for a direct browser-to-Cloudinary upload. */
  avatarSignature: () => client.get('/auth/me/avatar-signature').then(unwrap),
  saveAvatar: (avatarUrl) => client.put('/auth/me/avatar', { avatarUrl }).then(unwrap),
};

/**
 * Upload a picture straight to Cloudinary using a server-issued signature, then
 * hand the resulting URL back to our API. The file never touches our server and
 * the API secret never reaches the browser.
 */
export const uploadAvatar = async (file) => {
  const ticket = await authApi.avatarSignature();

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', ticket.apiKey);
  form.append('signature', ticket.signature);
  Object.entries(ticket.params).forEach(([key, value]) => form.append(key, String(value)));

  const response = await fetch(ticket.uploadUrl, { method: 'POST', body: form });
  const result = await response.json();
  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || 'The image could not be uploaded.');
  }

  // Our API re-checks the URL belongs to our Cloudinary account before saving.
  return authApi.saveAvatar(result.secure_url);
};

export const parkingApi = {
  search: (params) => client.get('/parking/search', { params }).then(unwrapList),
  detail: (id) => client.get(`/parking/${id}`).then(unwrap),
  availability: (id, vehicleType) =>
    client.get(`/parking/${id}/availability`, { params: { vehicleType } }).then(unwrap),
  myLots: (params) => client.get('/parking/mine', { params }).then(unwrapList),
  create: (payload) => client.post('/parking', payload).then(unwrap),
  update: (id, payload) => client.patch(`/parking/${id}`, payload).then(unwrap),
  manage: (id) => client.get(`/parking/${id}/manage`).then(unwrap),
  recount: (id) => client.post(`/parking/${id}/recount`).then(unwrap),
};

export const geoApi = {
  /** Coordinates -> a short place name, for the location field. */
  reverse: (latitude, longitude) =>
    client.get('/geo/reverse', { params: { latitude, longitude } }).then(unwrap),
};

export const pricingApi = {
  quote: (payload) => client.post('/pricing/quote', payload).then(unwrap),
  getRule: (lotId) => client.get(`/pricing/rules/${lotId}`).then(unwrap),
  updateRule: (lotId, payload) => client.put(`/pricing/rules/${lotId}`, payload).then(unwrap),
  simulate: (lotId, payload) => client.post(`/pricing/rules/${lotId}/simulate`, payload).then(unwrap),
};

export const bookingApi = {
  /**
   * Near capacity the server batches simultaneous requests for a few seconds and
   * runs an allocation model before answering, so this call can take 5-6 s. The
   * timeout is pinned here so it never drops below that if the default changes.
   */
  create: (payload) => client.post('/bookings', payload, { timeout: 30000 }).then(unwrap),
  mine: (params) => client.get('/bookings/mine', { params }).then(unwrapList),
  detail: (id) => client.get(`/bookings/${id}`).then(unwrap),
  spotMap: (id) => client.get(`/bookings/${id}/spot-map`).then(unwrap),
  forLot: (lotId, params) => client.get(`/bookings/lot/${lotId}`, { params }).then(unwrapList),
};

export const sessionApi = {
  mine: (params) => client.get('/sessions/mine', { params }).then(unwrapList),
  forLot: (lotId, params) => client.get(`/sessions/lot/${lotId}`, { params }).then(unwrapList),
  detail: (id) => client.get(`/sessions/${id}`).then(unwrap),
  previewBill: (id) => client.get(`/sessions/${id}/preview-bill`).then(unwrap),
};

export const paymentApi = {
  config: () => client.get('/payments/config').then(unwrap),
  bookingOrder: (bookingId) => client.post('/payments/booking-order', { bookingId }).then(unwrap),
  sessionOrder: (sessionId) => client.post('/payments/session-order', { sessionId }).then(unwrap),
  verify: (payload) => client.post('/payments/verify', payload).then(unwrap),
  fail: (payload) => client.post('/payments/failed', payload).then(unwrap),
  mine: (params) => client.get('/payments/mine', { params }).then(unwrapList),
  dues: () => client.get('/payments/mine/dues').then(unwrap),
  forLot: (lotId, params) => client.get(`/payments/lot/${lotId}`, { params }).then(unwrapList),
};

export const recognitionApi = {
  status: () => client.get('/recognition/status').then(unwrap),
  entry: (payload) => client.post('/recognition/entry', payload).then((r) => r.data),
  exit: (payload) => client.post('/recognition/exit', payload).then((r) => r.data),
  preview: (payload) => client.post('/recognition/preview', payload).then(unwrap),
  events: (lotId, params) => client.get(`/recognition/events/${lotId}`, { params }).then(unwrapList),
};

export const analyticsApi = {
  owner: (params) => client.get('/analytics/owner', { params }).then(unwrap),
  lot: (lotId, params) => client.get(`/analytics/lot/${lotId}`, { params }).then(unwrap),
  platform: (params) => client.get('/analytics/platform', { params }).then(unwrap),
};

export const usersApi = {
  dashboard: () => client.get('/users/dashboard').then(unwrap),
  ownerProfile: () => client.get('/users/owner-profile').then(unwrap),
  updateOwnerProfile: (payload) => client.patch('/users/owner-profile', payload).then(unwrap),
};

export const adminApi = {
  users: (params) => client.get('/admin/users', { params }).then(unwrapList),
  userDetail: (id) => client.get(`/admin/users/${id}`).then(unwrap),
  setUserStatus: (id, isActive) => client.patch(`/admin/users/${id}/status`, { isActive }).then(unwrap),
  lots: (params) => client.get('/admin/lots', { params }).then(unwrapList),
  reviewLot: (id, payload) => client.post(`/admin/lots/${id}/review`, payload).then(unwrap),
  setCommission: (payload) => client.put('/admin/commission', payload).then(unwrap),
  transactions: (params) => client.get('/admin/transactions', { params }).then(unwrapList),
  activity: (params) => client.get('/admin/activity', { params }).then(unwrapList),
  fraud: (params) => client.get('/admin/fraud', { params }).then(unwrapList),
};
