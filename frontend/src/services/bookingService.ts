import api from './api';

export interface BookingListParams {
  companyId: string;
  customerId?: string;
  vehicleId?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  page?: number;
  limit?: number;
}

export interface Booking {
  id: string;
  companyId: string;
  vehicleId: string;
  customerId: string;
  invoiceId?: string;
  bookingNumber: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  monthlyPeriods: number;
  remainingDays: number;
  dailyRate: string;
  monthlyRate: string;
  totalAmount: string;
  status: 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  vehicle?: {
    id: string;
    make: string;
    model: string;
    year: number;
    plateNumber: string;
  };
  customer?: {
    id: string;
    code: string;
    name: string;
    email?: string;
    phone?: string;
  };
  invoice?: any;
}

export interface BookingListResponse {
  success: boolean;
  data: Booking[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateBookingInput {
  companyId: string;
  vehicleId: string;
  customerId: string;
  startDate: string;
  endDate: string;
  notes?: string;
}

export interface ConfirmBookingInput {
  receivableAccountId: string;
  revenueAccountId: string;
}

const bookingService = {
  /**
   * List bookings with filters
   */
  async listBookings(params: BookingListParams): Promise<BookingListResponse> {
    const queryParams = new URLSearchParams();

    queryParams.append('companyId', params.companyId);
    if (params.customerId) queryParams.append('customerId', params.customerId);
    if (params.vehicleId) queryParams.append('vehicleId', params.vehicleId);
    if (params.status) queryParams.append('status', params.status);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());

    const response = await api.get(`/bookings?${queryParams.toString()}`);
    return response.data;
  },

  /**
   * Get booking by ID
   */
  async getBookingById(id: string): Promise<{ success: boolean; data: Booking }> {
    const response = await api.get(`/bookings/${id}`);
    return response.data;
  },

  /**
   * Create a new booking
   */
  async createBooking(data: CreateBookingInput): Promise<{ success: boolean; message: string; data: Booking }> {
    const response = await api.post('/bookings', data);
    return response.data;
  },

  /**
   * Confirm booking and generate invoice
   */
  async confirmBooking(id: string, data: ConfirmBookingInput): Promise<{ success: boolean; message: string; data: Booking }> {
    const response = await api.post(`/bookings/${id}/confirm`, data);
    return response.data;
  },
};

export default bookingService;
