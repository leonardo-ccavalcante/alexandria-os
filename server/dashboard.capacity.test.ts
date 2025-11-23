import { describe, expect, it } from "vitest";
import { getAnalyticsByLocation } from "./db";

describe("Dashboard Capacity Tracking", () => {
  it("should calculate capacity percentage correctly", async () => {
    const results = await getAnalyticsByLocation({});
    
    if (results && results.length > 0) {
      results.forEach((location: any) => {
        // Capacity percentage should be between 0 and 100
        expect(location.capacityPercentage).toBeGreaterThanOrEqual(0);
        expect(location.capacityPercentage).toBeLessThanOrEqual(100);
        
        // Free space should be non-negative
        expect(location.freeSpace).toBeGreaterThanOrEqual(0);
        
        // Total items should match capacity calculation
        const expectedCapacity = (location.totalItems / 25) * 100;
        expect(location.capacityPercentage).toBeCloseTo(Math.min(100, expectedCapacity), 1);
      });
    }
  });

  it("should flag locations near capacity (>= 80%)", async () => {
    const results = await getAnalyticsByLocation({});
    
    if (results && results.length > 0) {
      results.forEach((location: any) => {
        if (location.capacityPercentage >= 80 && location.capacityPercentage < 100) {
          expect(location.isNearCapacity).toBe(true);
          expect(location.isAtCapacity).toBe(false);
        }
      });
    }
  });

  it("should flag locations at capacity (>= 100%)", async () => {
    const results = await getAnalyticsByLocation({});
    
    if (results && results.length > 0) {
      results.forEach((location: any) => {
        if (location.capacityPercentage >= 100) {
          expect(location.isAtCapacity).toBe(true);
          expect(location.isNearCapacity).toBe(true);
        }
      });
    }
  });

  it("should calculate free space correctly", async () => {
    const results = await getAnalyticsByLocation({});
    
    if (results && results.length > 0) {
      results.forEach((location: any) => {
        const expectedFreeSpace = Math.max(0, 25 - location.totalItems);
        expect(location.freeSpace).toBe(expectedFreeSpace);
      });
    }
  });

  it("should return all required capacity fields", async () => {
    const results = await getAnalyticsByLocation({});
    
    if (results && results.length > 0) {
      const location = results[0];
      expect(location).toHaveProperty('location');
      expect(location).toHaveProperty('totalItems');
      expect(location).toHaveProperty('freeSpace');
      expect(location).toHaveProperty('capacityPercentage');
      expect(location).toHaveProperty('isNearCapacity');
      expect(location).toHaveProperty('isAtCapacity');
    }
  });

  it("should handle locations with zero books", async () => {
    const results = await getAnalyticsByLocation({});
    
    if (results && results.length > 0) {
      results.forEach((location: any) => {
        if (location.totalItems === 0) {
          expect(location.freeSpace).toBe(25);
          expect(location.capacityPercentage).toBe(0);
          expect(location.isNearCapacity).toBe(false);
          expect(location.isAtCapacity).toBe(false);
        }
      });
    }
  });

  it("should handle locations exceeding 25 books", async () => {
    const results = await getAnalyticsByLocation({});
    
    if (results && results.length > 0) {
      results.forEach((location: any) => {
        if (location.totalItems > 25) {
          expect(location.freeSpace).toBe(0);
          expect(location.capacityPercentage).toBe(100);
          expect(location.isAtCapacity).toBe(true);
        }
      });
    }
  });
});
