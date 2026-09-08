import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, homeRouteFor, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

import Landing from './pages/Landing';
import OwnerLanding from './pages/owner/OwnerLanding';
import AdminLanding from './pages/admin/AdminLanding';
import Login from './pages/Login';
import Register from './pages/Register';

import UserDashboard from './pages/user/Dashboard';
import UserProfile from './pages/user/Profile';
import LotDetail from './pages/user/LotDetail';
import MyBookings from './pages/user/MyBookings';
import BookingDetail from './pages/user/BookingDetail';
import Payments from './pages/user/Payments';

import OwnerDashboard from './pages/owner/Dashboard';
import MyLots from './pages/owner/MyLots';
import LotForm from './pages/owner/LotForm';
import LotManage from './pages/owner/LotManage';
import GateTerminal from './pages/owner/GateTerminal';
import OwnerProfile from './pages/owner/Profile';

import AdminDashboard from './pages/admin/Dashboard';
import AdminFacilities from './pages/admin/Facilities';
import AdminUsers from './pages/admin/Users';
import AdminTransactions from './pages/admin/Transactions';
import AdminActivity from './pages/admin/Activity';
import AdminFraud from './pages/admin/Fraud';

/**
 * "/" is the home page for everyone, but it is a different page per role: a
 * driver books from theirs, an owner reads about running a facility, an admin
 * about moderating the platform. Guests get the public marketing page.
 */
const RoleHome = () => {
  const { loading, role } = useAuth();

  // Wait for /auth/me so a signed-in owner never flashes the driver page.
  if (loading) return null;
  if (role === 'owner') {
    return (
      <Layout>
        <OwnerLanding />
      </Layout>
    );
  }
  if (role === 'admin') {
    return (
      <Layout>
        <AdminLanding />
      </Layout>
    );
  }
  return <Landing />;
};

const NotFound = () => {
  const { isAuthenticated, role } = useAuth();
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <p className="text-display text-brand-600">404</p>
      <h1 className="text-title-3 text-label">This page does not exist</h1>
      <a
        href={isAuthenticated ? homeRouteFor(role) : '/'}
        className="tap mt-2 rounded-capsule bg-brand-600 px-5 py-2.5 text-footnote font-semibold text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700"
      >
        Go back
      </a>
    </div>
  );
};

const App = () => (
  <BrowserRouter>
    {/* Theme sits above auth: the appearance is a device preference, not a
        property of whoever happens to be signed in. */}
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          {/* Home: dispatches to the landing page for whoever is signed in. */}
          <Route path="/" element={<RoleHome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* ---- Driver panel ---- */}
          <Route
            path="/app"
            element={
              <ProtectedRoute roles={['user']}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<UserDashboard />} />
            <Route path="parking/:id" element={<LotDetail />} />
            <Route path="bookings" element={<MyBookings />} />
            <Route path="bookings/:id" element={<BookingDetail />} />
            <Route path="payments" element={<Payments />} />
            <Route path="profile" element={<UserProfile />} />
          </Route>

          {/* ---- Parking owner panel ---- */}
          <Route
            path="/owner"
            element={
              <ProtectedRoute roles={['owner']}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<OwnerDashboard />} />
            <Route path="lots" element={<MyLots />} />
            <Route path="lots/new" element={<LotForm />} />
            <Route path="lots/:id" element={<LotManage />} />
            <Route path="lots/:id/edit" element={<LotForm />} />
            <Route path="gate" element={<GateTerminal />} />
            <Route path="profile" element={<OwnerProfile />} />
          </Route>

          {/* ---- Platform admin panel ---- */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="facilities" element={<AdminFacilities />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="transactions" element={<AdminTransactions />} />
            <Route path="activity" element={<AdminActivity />} />
            <Route path="fraud" element={<AdminFraud />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
);

export default App;
