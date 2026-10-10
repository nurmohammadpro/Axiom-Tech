export type Category =
  | "iPhone"
  | "Samsung"
  | "Google Pixel"
  | "Oppo"
  | "Redmi"
  | "Poco"
  | "MacBook"
  | "Headphones"
  | "Watch"
  | "VR"
  | "Charger";

export type Product = {
  id: string;
  name: string;
  brand: Category;
  category: "Phones" | "Laptops" | "Accessories" | "Wearables";
  price: number;
  originalPrice?: number;
  color: string;
  bg: string;
  short: string;
  description: string;
  sku?: string;
  specs: { label: string; value: string }[];
  images?: string[];
  inStock: boolean;
  /** Real on-hand stock, set only by the dashboard catalog (?withStock=1). */
  available?: number;
  stockStatus?: "ok" | "low" | "out";
};

const p = (
  id: string,
  name: string,
  brand: Category,
  category: Product["category"],
  price: number,
  originalPrice: number | undefined,
  short: string,
  bg: string,
  color: string,
  specs: [string, string][],
): Product => ({
  id,
  name,
  brand,
  category,
  price,
  originalPrice,
  short,
  bg,
  color,
  inStock: true,
  description: `The ${name} delivers premium performance with a refined design. Backed by manufacturer warranty and same-day dispatch from our store.`,
  specs: specs.map(([label, value]) => ({ label, value })),
});

export const products: Product[] = [
  p(
    "iphone-15-pro",
    "iPhone 15 Pro 256GB",
    "iPhone",
    "Phones",
    1099,
    1199,
    "Titanium. A17 Pro chip.",
    "#f2f2f4",
    "#1d1d1f",
    [
      ["Display", '6.1" Super Retina XDR'],
      ["Chip", "A17 Pro"],
      ["Storage", "256GB"],
      ["Camera", "48MP triple"],
    ],
  ),
  p(
    "iphone-15",
    "iPhone 15 128GB",
    "iPhone",
    "Phones",
    749,
    799,
    "Dynamic Island. USB-C.",
    "#e8ecef",
    "#1d1d1f",
    [
      ["Display", '6.1" Super Retina XDR'],
      ["Chip", "A16 Bionic"],
      ["Storage", "128GB"],
      ["Camera", "48MP dual"],
    ],
  ),
  p(
    "iphone-14",
    "iPhone 14 128GB",
    "iPhone",
    "Phones",
    599,
    699,
    "Reliable everyday flagship.",
    "#eef1f3",
    "#1d1d1f",
    [
      ["Display", '6.1" OLED'],
      ["Chip", "A15 Bionic"],
      ["Storage", "128GB"],
      ["Camera", "12MP dual"],
    ],
  ),
  p(
    "galaxy-s24-ultra",
    "Galaxy S24 Ultra 512GB",
    "Samsung",
    "Phones",
    1299,
    1419,
    "Galaxy AI. Titanium frame.",
    "#f0f0f2",
    "#111",
    [
      ["Display", '6.8" QHD+ AMOLED'],
      ["Chip", "Snapdragon 8 Gen 3"],
      ["Storage", "512GB"],
      ["Camera", "200MP quad"],
    ],
  ),
  p(
    "galaxy-s24",
    "Galaxy S24 256GB",
    "Samsung",
    "Phones",
    899,
    999,
    "Compact power with AI.",
    "#eef0f2",
    "#111",
    [
      ["Display", '6.2" FHD+ AMOLED'],
      ["Chip", "Exynos 2400"],
      ["Storage", "256GB"],
      ["Camera", "50MP triple"],
    ],
  ),
  p(
    "galaxy-a55",
    "Galaxy A55 128GB",
    "Samsung",
    "Phones",
    429,
    479,
    "Mid-range value pick.",
    "#eef0f2",
    "#111",
    [
      ["Display", '6.6" Super AMOLED'],
      ["Chip", "Exynos 1480"],
      ["Storage", "128GB"],
      ["Camera", "50MP triple"],
    ],
  ),
  p(
    "pixel-8-pro",
    "Google Pixel 8 Pro 256GB",
    "Google Pixel",
    "Phones",
    899,
    999,
    "Google AI photography.",
    "#eef2ef",
    "#111",
    [
      ["Display", '6.7" LTPO OLED'],
      ["Chip", "Tensor G3"],
      ["Storage", "256GB"],
      ["Camera", "50MP triple"],
    ],
  ),
  p(
    "pixel-8",
    "Google Pixel 8 128GB",
    "Google Pixel",
    "Phones",
    599,
    699,
    "Clean Android, 7 years support.",
    "#eef2ef",
    "#111",
    [
      ["Display", '6.2" OLED'],
      ["Chip", "Tensor G3"],
      ["Storage", "128GB"],
      ["Camera", "50MP dual"],
    ],
  ),
  p(
    "oppo-reno-11",
    "Oppo Reno 11 256GB",
    "Oppo",
    "Phones",
    429,
    479,
    "Portrait expert.",
    "#f1eef2",
    "#111",
    [
      ["Display", '6.7" AMOLED'],
      ["Chip", "Dimensity 7050"],
      ["Storage", "256GB"],
      ["Camera", "50MP triple"],
    ],
  ),
  p(
    "redmi-note-13-pro",
    "Redmi Note 13 Pro 256GB",
    "Redmi",
    "Phones",
    279,
    329,
    "120Hz AMOLED bargain.",
    "#f2efef",
    "#111",
    [
      ["Display", '6.67" AMOLED'],
      ["Chip", "Snapdragon 7s Gen 2"],
      ["Storage", "256GB"],
      ["Camera", "200MP triple"],
    ],
  ),
  p(
    "poco-x6-pro",
    "Poco X6 Pro 256GB",
    "Poco",
    "Phones",
    319,
    379,
    "Flagship speed, mid price.",
    "#f2eef0",
    "#111",
    [
      ["Display", '6.67" AMOLED 120Hz'],
      ["Chip", "Dimensity 8300 Ultra"],
      ["Storage", "256GB"],
      ["Camera", "64MP triple"],
    ],
  ),
  p(
    "macbook-air-m3",
    'MacBook Air 13" M3 8/256',
    "MacBook",
    "Laptops",
    1099,
    1199,
    "M3 chip. Fanless.",
    "#eef0f2",
    "#111",
    [
      ["Chip", "Apple M3"],
      ["Memory", "8GB"],
      ["Storage", "256GB SSD"],
      ["Display", '13.6" Liquid Retina'],
    ],
  ),
  p(
    "macbook-pro-14",
    'MacBook Pro 14" M3 Pro',
    "MacBook",
    "Laptops",
    1999,
    2199,
    "Pro workflows.",
    "#eef0f2",
    "#111",
    [
      ["Chip", "Apple M3 Pro"],
      ["Memory", "18GB"],
      ["Storage", "512GB SSD"],
      ["Display", '14.2" XDR'],
    ],
  ),
  p(
    "airpods-pro-2",
    "AirPods Pro 2 (USB-C)",
    "Headphones",
    "Accessories",
    229,
    249,
    "Adaptive audio.",
    "#f4f4f5",
    "#111",
    [
      ["ANC", "Yes"],
      ["Battery", "6h + 30h case"],
      ["Chip", "H2"],
      ["Connector", "USB-C"],
    ],
  ),
  p(
    "galaxy-buds-3-pro",
    "Galaxy Buds3 Pro",
    "Headphones",
    "Accessories",
    219,
    249,
    "Hi-Fi sound.",
    "#f4f4f5",
    "#111",
    [
      ["ANC", "Yes"],
      ["Battery", "6h + 24h case"],
      ["Codec", "SSC UHQ"],
      ["Water", "IP57"],
    ],
  ),
  p(
    "apple-watch-s9",
    "Apple Watch Series 9 45mm",
    "Watch",
    "Wearables",
    429,
    449,
    "Double Tap gesture.",
    "#eef0f2",
    "#111",
    [
      ["Case", "45mm Aluminum"],
      ["Chip", "S9 SiP"],
      ["Battery", "18h"],
      ["Water", "50m"],
    ],
  ),
  p(
    "galaxy-watch-7",
    "Galaxy Watch7 44mm",
    "Watch",
    "Wearables",
    329,
    359,
    "Advanced health tracking.",
    "#eef0f2",
    "#111",
    [
      ["Case", "44mm"],
      ["Chip", "Exynos W1000"],
      ["Battery", "40h"],
      ["Water", "5ATM"],
    ],
  ),
  p(
    "meta-quest-3",
    "Meta Quest 3 128GB",
    "VR",
    "Accessories",
    499,
    549,
    "Mixed reality headset.",
    "#eef2ef",
    "#111",
    [
      ["Resolution", "2064×2208/eye"],
      ["Chip", "Snapdragon XR2 Gen 2"],
      ["Storage", "128GB"],
      ["Refresh", "120Hz"],
    ],
  ),
  p(
    "apple-20w-charger",
    "Apple 20W USB-C Charger",
    "Charger",
    "Accessories",
    19,
    29,
    "Fast charge essential.",
    "#f4f4f5",
    "#111",
    [
      ["Output", "20W USB-C PD"],
      ["Compatible", "iPhone, iPad"],
      ["Cable", "Not included"],
      ["Warranty", "1 year"],
    ],
  ),
  p(
    "samsung-45w-charger",
    "Samsung 45W Super Fast Charger",
    "Charger",
    "Accessories",
    39,
    49,
    "Super Fast Charging 2.0.",
    "#f4f4f5",
    "#111",
    [
      ["Output", "45W PD PPS"],
      ["Cable", "5A USB-C included"],
      ["Compatible", "Galaxy S/Note/Tab"],
      ["Warranty", "1 year"],
    ],
  ),
];

export function getProduct(id: string) {
  return products.find((x) => x.id === id);
}

export const brands: Category[] = [
  "iPhone",
  "Samsung",
  "Google Pixel",
  "Oppo",
  "Redmi",
  "Poco",
  "MacBook",
  "Headphones",
  "Watch",
  "VR",
  "Charger",
];
