export type OrderStatus = "Processing" | "Shipped" | "Delivered" | "Cancelled" | "Refunded";

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface Address {
  id: string;
  label: string;
  fullName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

export interface Order {
  id: string;
  date: string;
  status: OrderStatus;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  items: OrderItem[];
  shippingAddress: Address;
  paymentMethod: string;
  tracking: { carrier: string; number: string } | null;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  loyaltyPoints: number;
  memberSince: string;
}

export const userProfile: UserProfile = {
  firstName: "Sarah",
  lastName: "Khan",
  email: "sarah.khan@example.com",
  phone: "+1 (555) 234-5678",
  loyaltyPoints: 2840,
  memberSince: "2024-01-15",
};

const homeAddress: Address = {
  id: "addr-1",
  label: "Home",
  fullName: "Sarah Khan",
  street: "452 Maple Avenue, Apt 3B",
  city: "Portland",
  state: "OR",
  zip: "97201",
  country: "United States",
  phone: "+1 (555) 234-5678",
  isDefault: true,
};

const officeAddress: Address = {
  id: "addr-2",
  label: "Office",
  fullName: "Sarah Khan",
  street: "1200 SW Broadway, Suite 400",
  city: "Portland",
  state: "OR",
  zip: "97205",
  country: "United States",
  phone: "+1 (555) 987-6543",
  isDefault: false,
};

const parentsAddress: Address = {
  id: "addr-3",
  label: "Parents",
  fullName: "Sarah Khan",
  street: "88 Cedar Ridge Road",
  city: "Bend",
  state: "OR",
  zip: "97701",
  country: "United States",
  phone: "+1 (541) 555-1200",
  isDefault: false,
};

export const addresses: Address[] = [homeAddress, officeAddress, parentsAddress];

function a(
  id: string,
  date: string,
  status: OrderStatus,
  subtotal: number,
  shipping: number,
  tax: number,
  items: OrderItem[],
  addr: Address,
  paymentMethod: string,
  tracking: { carrier: string; number: string } | null,
): Order {
  return {
    id,
    date,
    status,
    subtotal,
    shipping,
    tax,
    total: subtotal + shipping + tax,
    items,
    shippingAddress: addr,
    paymentMethod,
    tracking,
  };
}

export const orders: Order[] = [
  a(
    "CH-1024",
    "2026-07-28T10:15:00Z",
    "Processing",
    2198,
    0,
    219.8,
    [
      { productId: "iphone-15-pro", name: "iPhone 15 Pro 256GB", price: 1099, qty: 1 },
      { productId: "apple-20w-charger", name: "Apple 20W USB-C Charger", price: 19, qty: 2 },
    ],
    homeAddress,
    "Visa •••• 4242",
    null,
  ),
  a(
    "CH-1023",
    "2026-07-26T14:30:00Z",
    "Shipped",
    899,
    0,
    89.9,
    [{ productId: "galaxy-s24", name: "Galaxy S24 256GB", price: 899, qty: 1 }],
    officeAddress,
    "Mastercard •••• 9876",
    { carrier: "FedEx", number: "FX1234567890" },
  ),
  a(
    "CH-1022",
    "2026-07-22T09:00:00Z",
    "Delivered",
    429,
    5.99,
    43.5,
    [{ productId: "galaxy-a55", name: "Galaxy A55 128GB", price: 429, qty: 1 }],
    parentsAddress,
    "Visa •••• 4242",
    { carrier: "UPS", number: "1Z999AA10123456784" },
  ),
  a(
    "CH-1021",
    "2026-07-20T16:45:00Z",
    "Delivered",
    248,
    0,
    24.8,
    [
      { productId: "airpods-pro-2", name: "AirPods Pro 2 (USB-C)", price: 229, qty: 1 },
      { productId: "apple-20w-charger", name: "Apple 20W USB-C Charger", price: 19, qty: 1 },
    ],
    homeAddress,
    "PayPal",
    { carrier: "USPS", number: "9400111899223456789012" },
  ),
  a(
    "CH-1020",
    "2026-07-18T11:20:00Z",
    "Cancelled",
    1299,
    0,
    129.9,
    [{ productId: "galaxy-s24-ultra", name: "Galaxy S24 Ultra 512GB", price: 1299, qty: 1 }],
    homeAddress,
    "Visa •••• 4242",
    null,
  ),
  a(
    "CH-1019",
    "2026-07-15T08:00:00Z",
    "Refunded",
    479,
    0,
    47.9,
    [{ productId: "galaxy-a55", name: "Galaxy A55 128GB", price: 429, qty: 1 }],
    homeAddress,
    "Mastercard •••• 9876",
    null,
  ),
  a(
    "CH-1018",
    "2026-07-12T13:10:00Z",
    "Delivered",
    1099,
    0,
    109.9,
    [{ productId: "iphone-15-pro", name: "iPhone 15 Pro 256GB", price: 1099, qty: 1 }],
    officeAddress,
    "Visa •••• 4242",
    { carrier: "FedEx", number: "FX0987654321" },
  ),
  a(
    "CH-1017",
    "2026-07-08T15:30:00Z",
    "Delivered",
    749,
    5.99,
    75.5,
    [{ productId: "iphone-15", name: "iPhone 15 128GB", price: 749, qty: 1 }],
    homeAddress,
    "PayPal",
    { carrier: "UPS", number: "1Z999AA10123456785" },
  ),
  a(
    "CH-1016",
    "2026-07-05T10:00:00Z",
    "Delivered",
    249,
    0,
    24.9,
    [
      { productId: "galaxy-buds-3-pro", name: "Galaxy Buds3 Pro", price: 219, qty: 1 },
      { productId: "apple-20w-charger", name: "Apple 20W USB-C Charger", price: 19, qty: 1 },
    ],
    homeAddress,
    "Visa •••• 4242",
    { carrier: "USPS", number: "9400111899223456789013" },
  ),
  a(
    "CH-1015",
    "2026-06-28T09:45:00Z",
    "Shipped",
    499,
    0,
    49.9,
    [{ productId: "meta-quest-3", name: "Meta Quest 3 128GB", price: 499, qty: 1 }],
    homeAddress,
    "Mastercard •••• 9876",
    { carrier: "FedEx", number: "FX5555555555" },
  ),
  a(
    "CH-1014",
    "2026-06-20T14:00:00Z",
    "Delivered",
    899,
    0,
    89.9,
    [{ productId: "pixel-8-pro", name: "Google Pixel 8 Pro 256GB", price: 899, qty: 1 }],
    officeAddress,
    "Visa •••• 4242",
    { carrier: "UPS", number: "1Z999AA10123456786" },
  ),
  a(
    "CH-1013",
    "2026-06-10T11:30:00Z",
    "Delivered",
    1798,
    0,
    179.8,
    [
      { productId: "macbook-air-m3", name: 'MacBook Air M3 13"', price: 1099, qty: 1 },
      { productId: "airpods-pro-2", name: "AirPods Pro 2 (USB-C)", price: 229, qty: 1 },
    ],
    homeAddress,
    "Amex •••• 3005",
    { carrier: "FedEx", number: "FX7777777777" },
  ),
  a(
    "CH-1012",
    "2026-05-25T16:00:00Z",
    "Refunded",
    599,
    5.99,
    60.5,
    [{ productId: "iphone-14", name: "iPhone 14 128GB", price: 599, qty: 1 }],
    homeAddress,
    "Visa •••• 4242",
    null,
  ),
  a(
    "CH-1011",
    "2026-05-15T08:30:00Z",
    "Delivered",
    1499,
    0,
    149.9,
    [{ productId: "macbook-pro-14", name: 'MacBook Pro M4 14"', price: 1499, qty: 1 }],
    officeAddress,
    "Amex •••• 3005",
    { carrier: "FedEx", number: "FX8888888888" },
  ),
  a(
    "CH-1010",
    "2026-05-02T10:15:00Z",
    "Delivered",
    249,
    0,
    24.9,
    [{ productId: "galaxy-watch-7", name: "Galaxy Watch 7 44mm", price: 249, qty: 1 }],
    homeAddress,
    "Mastercard •••• 9876",
    { carrier: "USPS", number: "9400111899223456789014" },
  ),
];

export function getOrder(id: string): Order | undefined {
  return orders.find((o) => o.id === id);
}
