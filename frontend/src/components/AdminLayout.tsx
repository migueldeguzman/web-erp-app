import { Outlet, Link, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function AdminLayout() {
  const { user } = useAuthStore();
  const location = useLocation();

  // Check if user is admin
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const navLinkClass = (path: string) => {
    return `px-3 py-2 rounded-md text-sm font-medium ${
      isActive(path)
        ? 'bg-gray-900 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;
  };

  return (
    <div>
      {/* Admin Navigation */}
      <div className="bg-gray-800 mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h2 className="text-white text-lg font-bold">Admin Panel</h2>
              </div>
              <div className="ml-10 flex items-baseline space-x-4">
                <Link to="/admin" className={navLinkClass('/admin')}>
                  Dashboard
                </Link>
                <Link to="/admin/users" className={navLinkClass('/admin/users')}>
                  Users
                </Link>
                <Link to="/admin/audit-logs" className={navLinkClass('/admin/audit-logs')}>
                  Audit Logs
                </Link>
                <Link to="/admin/issues" className={navLinkClass('/admin/issues')}>
                  Issue Tracker
                </Link>
                <Link to="/admin/system-health" className={navLinkClass('/admin/system-health')}>
                  System Health
                </Link>
              </div>
            </div>
            <div>
              <Link
                to="/"
                className="text-gray-300 hover:text-white text-sm font-medium"
              >
                ← Back to Main App
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Content */}
      <Outlet />
    </div>
  );
}