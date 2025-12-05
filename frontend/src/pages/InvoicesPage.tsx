export default function InvoicesPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
        <button className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">
          Create Invoice
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 text-center text-gray-500">
          No invoices found. Create your first invoice to get started.
        </div>
      </div>
    </div>
  );
}
