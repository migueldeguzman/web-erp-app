import { PrismaClient, CompanySettings } from '@prisma/client';
import prisma from '../config/database';

export class CompanySettingsService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Get company settings (creates default if not exists)
   */
  async getSettings(companyId: string): Promise<CompanySettings> {
    let settings = await this.prisma.companySettings.findUnique({
      where: { companyId },
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await this.createDefaultSettings(companyId);
    }

    return settings;
  }

  /**
   * Create default settings for a company
   */
  async createDefaultSettings(companyId: string): Promise<CompanySettings> {
    return await this.prisma.companySettings.create({
      data: {
        companyId,
        tempLockDurationMinutes: 30,
        allowOverbooking: false,
        autoAssignVehicle: true,
        sendBookingNotifications: true,
        sendContractNotifications: true,
        sendLockExpiryNotifications: true,
        contractPrefix: 'RASMLY',
        requireDepositForBooking: true,
        defaultDepositAmount: 0,
        enableAutoRelease: true,
        autoReleaseCheckInterval: 5,
      },
    });
  }

  /**
   * Update company settings
   */
  async updateSettings(
    companyId: string,
    data: Partial<Omit<CompanySettings, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>
  ): Promise<CompanySettings> {
    // Ensure settings exist
    await this.getSettings(companyId);

    return await this.prisma.companySettings.update({
      where: { companyId },
      data,
    });
  }

  /**
   * Get temp lock duration for a company
   */
  async getTempLockDuration(companyId: string): Promise<number> {
    const settings = await this.getSettings(companyId);
    return settings.tempLockDurationMinutes;
  }

  /**
   * Check if auto-assign vehicle is enabled
   */
  async isAutoAssignEnabled(companyId: string): Promise<boolean> {
    const settings = await this.getSettings(companyId);
    return settings.autoAssignVehicle;
  }

  /**
   * Check if overbooking is allowed
   */
  async isOverbookingAllowed(companyId: string): Promise<boolean> {
    const settings = await this.getSettings(companyId);
    return settings.allowOverbooking;
  }

  /**
   * Get contract number prefix
   */
  async getContractPrefix(companyId: string): Promise<string> {
    const settings = await this.getSettings(companyId);
    return settings.contractPrefix;
  }

  /**
   * Check if auto-release is enabled
   */
  async isAutoReleaseEnabled(companyId: string): Promise<boolean> {
    const settings = await this.getSettings(companyId);
    return settings.enableAutoRelease;
  }

  /**
   * Get auto-release check interval
   */
  async getAutoReleaseInterval(companyId: string): Promise<number> {
    const settings = await this.getSettings(companyId);
    return settings.autoReleaseCheckInterval;
  }
}

export default new CompanySettingsService();
