import { useAuthStore } from '../stores/authStore';

export default function DashboardPage() {
  const { user } = useAuthStore();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">
          Welcome, {user?.firstName} {user?.lastName}!
        </h2>
        <p className="text-gray-600">
          This is your financial ERP dashboard. Navigate using the menu above to manage invoices,
          payments, and journal vouchers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">Invoices</h3>
          <p className="text-3xl font-bold text-primary-600">0</p>
          <p className="text-sm text-gray-600 mt-2">Total pending invoices</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">Payments</h3>
          <p className="text-3xl font-bold text-green-600">0</p>
          <p className="text-sm text-gray-600 mt-2">Payments this month</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2">Journal Vouchers</h3>
          <p className="text-3xl font-bold text-blue-600">0</p>
          <p className="text-sm text-gray-600 mt-2">Draft vouchers</p>
        </div>
      </div>
    </div>
  );
}
