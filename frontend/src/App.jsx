import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, homeRouteFor, useAuth } from './context/AuthContext';

import Landing from './pages/Landing';
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
import BusinessProfile from './pages/owner/BusinessProfile';

import AdminDashboard from './pages/admin/Dashboard';
import AdminFacilities from './pages/admin/Facilities';
import AdminUsers from './pages/admin/Users';
import AdminTransactions from './pages/admin/Transactions';
import AdminActivity from './pages/admin/Activity';
import AdminFraud from './pages/admin/Fraud';

const NotFound = () => {
  const { isAuthenticated, role } = useAuth();
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <p className="text-5xl font-bold text-brand-600">404</p>
      <h1 className="text-lg font-semibold text-ink-900">This page does not exist</h1>
      <a
        href={isAuthenticated ? homeRouteFor(role) : '/'}
        className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Go back
      </a>
    </div>
  );
};

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        {/* Public landing page: the same page for visitors and signed-in drivers. */}
        <Route path="/" element={<Landing />} />
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
          <Route path="profile" element={<BusinessProfile />} />
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
  </BrowserRouter>
);

export default App;
