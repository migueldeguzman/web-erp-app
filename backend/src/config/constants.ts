/**
 * Application Constants
 *
 * Centralized configuration for default values used across the application.
 * This makes it easy to switch to multi-tenancy in the future.
 */

/**
 * Default Company Configuration
 *
 * Current setup: Single-tenant application for Vesla Rent A Car
 * Future: Will support multi-tenant with company selection
 *
 * When selling to other companies:
 * 1. Remove DEFAULT_COMPANY_ID or make it null
 * 2. Require companyId in all API requests
 * 3. Add company selection in frontend
 */
export const DEFAULT_COMPANY_ID = process.env.DEFAULT_COMPANY_ID || 'a58cbf7a-0fe3-4b84-9b5a-0b7e27d8bbce';
export const DEFAULT_COMPANY_NAME = 'Vesla Rent A Car';
export const DEFAULT_COMPANY_CODE = 'VRC';

/**
 * Helper to get default company ID
 * Returns the configured default company ID
 */
export function getDefaultCompanyId(): string {
  return DEFAULT_COMPANY_ID;
}

/**
 * Helper to resolve company ID
 * If provided companyId is null/undefined, returns default
 * Otherwise returns the provided companyId
 */
export function resolveCompanyId(companyId?: string | null): string {
  return companyId || DEFAULT_COMPANY_ID;
}
