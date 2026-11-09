# SortableTable Usage Guide

The new `SortableTable` component adds click-to-sort functionality to all datatables globally.

## Basic Usage

```tsx
import { SortableTable } from "@/components/dashboard/dashboard-shell";

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

const columns = [
  { key: "name", header: "Product Name", sortable: true },
  { key: "price", header: "Price", sortable: true },
  { key: "stock", header: "Stock", sortable: true },
];

const data = [
  { id: "1", name: "iPhone 13", price: 70000, stock: 5 },
  { id: "2", name: "Samsung Galaxy", price: 65000, stock: 3 },
];

<SortableTable columns={columns} data={data} />
```

## Advanced Features

### Custom Rendering
```tsx
const columns = [
  { key: "name", header: "Product", sortable: true },
  { 
    key: "price", 
    header: "Price", 
    sortable: true,
    render: (value) => `৳${value.toLocaleString()}`
  },
  { 
    key: "status", 
    header: "Status", 
    sortable: true,
    render: (value) => <Pill tone={value === "active" ? "success" : "warn"}>{value}</Pill>
  },
];
```

### Default Sorting
```tsx
<SortableTable 
  columns={columns} 
  data={data}
  defaultSortColumn="name"
  defaultSortDirection="asc"
/>
```

### Custom Empty Message
```tsx
<SortableTable 
  columns={columns} 
  data={data}
  emptyMessage="No products found matching your criteria"
/>
```

## Sort Behavior

- **Click header**: Sort ascending
- **Click again**: Sort descending  
- **Click third time**: Remove sorting
- **Different column**: Sort ascending by new column

## Supported Data Types

- **Strings**: Case-insensitive alphabetical sort
- **Numbers**: Numeric sort (integers, decimals)
- **Dates**: Chronological sort
- **Mixed**: Converts to string and compares

## Migration from Old Table

### Before (Old API):
```tsx
const columns = ["Product", "Price", "Stock"];
const rows = [
  [<span>iPhone</span>, <span>৳70,000</span>, <span>5</span>],
  [<span>Samsung</span>, <span>৳65,000</span>, <span>3</span>],
];
<Table columns={columns} rows={rows} />
```

### After (New API):
```tsx
const columns = [
  { key: "name", header: "Product", sortable: true },
  { key: "price", header: "Price", sortable: true },
  { key: "stock", header: "Stock", sortable: true },
];
const data = [
  { name: "iPhone", price: 70000, stock: 5 },
  { name: "Samsung", price: 65000, stock: 3 },
];
<SortableTable columns={columns} data={data} />
```

## Features

✅ **Click-to-sort** on any sortable column
✅ **Visual indicators** (up/down arrows) for sort direction
✅ **Multi-type support** (strings, numbers, dates)
✅ **Custom rendering** per cell
✅ **Empty state** handling
✅ **Backward compatible** with existing Table component
✅ **Global availability** via dashboard-shell export