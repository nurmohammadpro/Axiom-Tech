# Stock System Analysis

## How Stock is Tracked

### Three Parallel Systems

1. **Serialized Units (`inventoryUnits`)**
   - Physical devices with IMEI/serial numbers
   - Status: `available`, `sold`, `reserved`, `damaged`
   - Each unit has a location (`locationId`)
   - Used for: Phones, laptops, serialized devices

2. **Quantity Balances (`inventoryBalances`)** 
   - Per-variant, per-location quantities
   - Tracks: `availableQty`, `reservedQty`, `damagedQty`, `inTransitQty`
   - Key: `(variantId, locationId)`
   - Used for: Accessories, non-serialized items

3. **Legacy Counters (`inventory` table, `productVariants.quantity`)**
   - Total quantity across all locations
   - SKU-based legacy system
   - Being phased out but still updated for compatibility

### Stock Calculation Logic

**For Display (inventory API):**
```typescript
// Serialized products: count available units
available = count(inventoryUnits WHERE status='available' AND variantId=X)

// Non-serialized: use balance or fallback to variant.quantity
available = balance.availableQty OR variant.quantity
```

**For Location Filtering:**
- Checks both `item.location` (legacy) and `byLocation` array
- Filters to only show stock for assigned warehouse

### Stock Update Operations

**When Items are Sold:**
1. Mark `inventoryUnits.status = 'sold'` for serialized units
2. Deduct from `productVariants.quantity`
3. Deduct from `inventory.quantity` (legacy)
4. Deduct from `inventoryBalances.availableQty`
5. Create `inventoryMovements` record

**When Items are Received:**
1. Insert records into `inventoryUnits` 
2. Add to `productVariants.quantity`
3. Add to `inventory.quantity` (legacy)
4. Add to `inventoryBalances.availableQty`
5. Create `inventoryMovements` record

## Potential Issues Found

### 1. **Race Conditions in Dual-Write**
- **Issue**: Multiple tables updated in transaction but not atomically consistent
- **Risk**: If one update fails, stock counts get out of sync
- **Impact**: Shows wrong available quantities

### 2. **Missing Cascade Updates**
- **Issue**: When serialized units are sold, balance deductions use variant location, not unit location
- **Risk**: If unit.locationId != balance.locationId, wrong balance is updated
- **Impact**: Warehouse stock counts can be wrong

### 3. **Legacy Fallback Logic**
- **Issue**: Falls back to total `variant.quantity` when no balance exists
- **Risk**: Shows global stock instead of location-specific stock
- **Impact**: Staff think they have stock that's actually at another warehouse

### 4. **No Stock Reconciliation**
- **Issue**: No periodic reconciliation between the three systems
- **Risk**: Drift accumulates over time
- **Impact**: Gradual degradation of accuracy

### 5. **Transfer/Adjustment Gaps**
- **Issue**: Stock transfers between warehouses may not update all systems
- **Risk**: Units moved but balances not updated
- **Impact**: Discrepancy between physical and digital stock

## Recommended Fixes

### 1. **Add Stock Reconciliation Query**
```sql
-- Find discrepancies between unit counts and balance claims
SELECT 
  variantId,
  locationId,
  availableQty as balance_claim,
  (SELECT COUNT(*) FROM inventory_units 
   WHERE variantId=ib.variantId 
   AND locationId=ib.locationId 
   AND status='available') as actual_units
FROM inventory_balances ib
WHERE availableQty != actual_units;
```

### 2. **Fix Sale Deduction Logic**
- Use unit's actual location for balance updates, not variant location
- Ensure all three systems are updated atomically

### 3. **Add Validation Triggers**
- Prevent sale if stock doesn't match across all systems
- Block receiving if duplicate IMEI detected late

### 4. **Implement Periodic Reconciliation Job**
- Nightly job to sync unit counts with balance claims
- Alert on discrepancies > threshold

### 5. **Add Audit Logging for All Stock Changes**
- Log before/after for every stock movement
- Track which system initiated the change

## Immediate Actions Needed

1. **Run stock audit query** to find current discrepancies
2. **Check for orphaned balances** (balances for variant/location combos with no actual units)
3. **Verify serialized units** match balance claims
4. **Test location filtering** to ensure scoped users see correct warehouse stock
