/**
 * Utility functions for MIST ↔ OCT conversion
 * OneChain uses 9 decimals: 1 OCT = 1,000,000,000 MIST
 */

export const ONECHAIN_DECIMALS = 9;
export const MIST_PER_OCT = 1_000_000_000; // 10^9

/**
 * Convert OCT to MIST (for sending to blockchain)
 * @param oct Amount in OCT
 * @returns Amount in MIST
 */
export function octToMist(oct: number): number {
  return Math.floor(oct * MIST_PER_OCT);
}

/**
 * Convert MIST to OCT (for displaying to user)
 * @param mist Amount in MIST
 * @returns Amount in OCT
 */
export function mistToOct(mist: number): number {
  return mist / MIST_PER_OCT;
}

/**
 * Format OCT amount for display
 * @param oct Amount in OCT
 * @param decimals Number of decimal places (default: 2)
 * @returns Formatted string
 */
export function formatOct(oct: number, decimals: number = 2): string {
  return oct.toFixed(decimals);
}

/**
 * Format MIST amount as OCT for display
 * @param mist Amount in MIST
 * @param decimals Number of decimal places (default: 2)
 * @returns Formatted OCT string
 */
export function formatMistAsOct(mist: number, decimals: number = 2): string {
  return formatOct(mistToOct(mist), decimals);
}

/**
 * Validate OCT amount
 * @param oct Amount in OCT
 * @returns true if valid
 */
export function isValidOctAmount(oct: number): boolean {
  return oct > 0 && Number.isFinite(oct);
}

/**
 * Calculate investment amount from shares and price per share
 * @param shares Number of shares
 * @param pricePerShareMist Price per share in MIST
 * @returns Investment amount in OCT
 */
export function calculateInvestmentAmount(shares: number, pricePerShareMist: number): number {
  const pricePerShareOct = mistToOct(pricePerShareMist);
  return shares * pricePerShareOct;
}

/**
 * Parse blockchain timestamp to JavaScript Date
 * @param timestamp Timestamp from blockchain (can be string or number)
 * @returns Date object or null if invalid
 */
export function parseBlockchainTimestamp(timestamp: any): Date | null {
  if (!timestamp) return null;
  
  try {
    let date: Date;
    
    // If it's a number, treat it as milliseconds since epoch
    if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    }
    // If it's a string that looks like a number, convert it
    else if (typeof timestamp === 'string' && /^\d+$/.test(timestamp)) {
      const numTimestamp = parseInt(timestamp);
      // If it's in seconds (10 digits), convert to milliseconds
      // If it's in milliseconds (13 digits), use as-is
      date = numTimestamp < 10000000000 
        ? new Date(numTimestamp * 1000) 
        : new Date(numTimestamp);
    }
    // Try to parse as-is
    else {
      date = new Date(timestamp);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return null;
    }
    
    return date;
  } catch (error) {
    console.warn('Error parsing blockchain timestamp:', timestamp, error);
    return null;
  }
}

/**
 * Format blockchain timestamp for display
 * @param timestamp Timestamp from blockchain
 * @param fallback Fallback text if timestamp is invalid
 * @returns Formatted date string
 */
export function formatBlockchainTimestamp(timestamp: any, fallback: string = "Recent"): string {
  const date = parseBlockchainTimestamp(timestamp);
  if (date) {
    // Check if the date is reasonable (not too far in the past or future)
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    
    if (date >= oneYearAgo && date <= oneYearFromNow) {
      return date.toLocaleDateString();
    }
  }
  return fallback;
}