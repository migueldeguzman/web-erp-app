import { Request, Response } from 'express';
import { AuthRequest } from '../types/auth';
import rentalContractService from '../services/rental-contract.service';
import { RentalContractStatus } from '@prisma/client';

export class RentalContractController {
  /**
   * Approve booking and create rental contract
   * POST /api/rental-contracts/approve-booking
   */
  async approveBooking(req: AuthRequest, res: Response) {
    try {
      const { bookingId, vehicleId } = req.body;
      const userId = req.user!.id;

      const contract = await rentalContractService.createFromBooking(
        bookingId,
        userId,
        vehicleId, // Optional: sales agent can change vehicle
        req.auditContext
      );

      res.status(201).json({
        success: true,
        data: contract,
        message: 'Rental contract created successfully',
      });
    } catch (error: any) {
      console.error('Error approving booking:', error);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get rental contract by ID
   * GET /api/rental-contracts/:id
   */
  async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const contract = await rentalContractService.getById(id);

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: 'Rental contract not found',
        });
      }

      res.json({
        success: true,
        data: contract,
      });
    } catch (error: any) {
      console.error('Error fetching rental contract:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get rental contract by contract number
   * GET /api/rental-contracts/by-number/:companyId/:contractNumber
   */
  async getByContractNumber(req: AuthRequest, res: Response) {
    try {
      const { companyId, contractNumber } = req.params;

      const contract = await rentalContractService.getByContractNumber(
        companyId,
        contractNumber
      );

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: 'Rental contract not found',
        });
      }

      res.json({
        success: true,
        data: contract,
      });
    } catch (error: any) {
      console.error('Error fetching rental contract:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * List rental contracts
   * GET /api/rental-contracts
   */
  async list(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: any = {};

      if (req.query.status) {
        filters.status = req.query.status as RentalContractStatus;
      }

      if (req.query.customerId) {
        filters.customerId = req.query.customerId as string;
      }

      if (req.query.vehicleId) {
        filters.vehicleId = req.query.vehicleId as string;
      }

      if (req.query.startDate) {
        filters.startDate = new Date(req.query.startDate as string);
      }

      if (req.query.endDate) {
        filters.endDate = new Date(req.query.endDate as string);
      }

      if (req.query.search) {
        filters.search = req.query.search as string;
      }

      const result = await rentalContractService.list(
        companyId as string,
        page,
        limit,
        filters
      );

      res.json({
        success: true,
        data: result.contracts,
        pagination: result.pagination,
      });
    } catch (error: any) {
      console.error('Error listing rental contracts:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Update contract status
   * PATCH /api/rental-contracts/:id/status
   */
  async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const contract = await rentalContractService.updateStatus(
        id,
        status,
        req.auditContext
      );

      res.json({
        success: true,
        data: contract,
        message: 'Contract status updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating contract status:', error);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Record vehicle pickup
   * POST /api/rental-contracts/:id/pickup
   */
  async recordPickup(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { outKm, outFuel, outDate } = req.body;

      const contract = await rentalContractService.recordPickup(id, {
        outKm: parseInt(outKm),
        outFuel,
        outDate: outDate ? new Date(outDate) : undefined,
      });

      res.json({
        success: true,
        data: contract,
        message: 'Vehicle pickup recorded successfully',
      });
    } catch (error: any) {
      console.error('Error recording pickup:', error);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Record vehicle return
   * POST /api/rental-contracts/:id/return
   */
  async recordReturn(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { inKm, inFuel, inDate, additionalCharges } = req.body;

      const contract = await rentalContractService.recordReturn(id, {
        inKm: parseInt(inKm),
        inFuel,
        inDate: inDate ? new Date(inDate) : undefined,
        additionalCharges,
      });

      res.json({
        success: true,
        data: contract,
        message: 'Vehicle return recorded successfully',
      });
    } catch (error: any) {
      console.error('Error recording return:', error);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Cancel rental contract
   * POST /api/rental-contracts/:id/cancel
   */
  async cancel(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const contract = await rentalContractService.cancel(
        id,
        reason,
        req.auditContext
      );

      res.json({
        success: true,
        data: contract,
        message: 'Rental contract cancelled successfully',
      });
    } catch (error: any) {
      console.error('Error cancelling contract:', error);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default new RentalContractController();
