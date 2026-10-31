export type UserRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'DEMO_VIEWER';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthTenant {
  id: string;
  name: string;
  legalName?: string | null;
  document?: string | null;
  stateRegistration?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  slug: string;
  isDemo: boolean;
  isSandbox: boolean;
  maxProducts: number;
  expiresAt: string | null;
}

export interface PublicStoreClient {
  id: string;
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
}

export interface SystemModeConfig {
  appMode: 'portfolio_sandbox' | 'commercial_production';
  isPortfolioSandbox: boolean;
  sandboxTtlHours: number;
  sandboxMaxProducts: number;
  maxUploadSizeKb: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
  leadTimeDays: number;
  createdAt?: string;
  productsCount?: number;
  entriesCount?: number;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  notes: string | null;
  createdAt: string;
  totalOrders: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  document: string | null;
  address?: string | null;
  jobTitle: string;
  role: UserRole;
  createdAt: string;
  salesCount: number;
  salesRevenue: number;
  movementsCount: number;
}

export interface Size {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
}

export interface Color {
  id: string;
  name: string;
  hexCode: string;
}

export interface PresetGalleryItem {
  id: string;
  name: string;
  url: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  barcodeEan: string | null;
  sizeId: string;
  sizeCode: string;
  sizeName: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  priceOverride: number | null;
  finalPrice: number;
  stockQuantity: number;
  minStockAlert: number;
  isLowStock: boolean;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  basePrice: number;
  costPrice: number;
  imageUrl: string | null;
  isCustomUpload: boolean;
  unityPrefabId: string | null;
  unityCategorySlot: 'TORSO' | 'LEGS' | 'FEET' | 'HEAD' | 'ACCESSORY' | null;
  active: boolean;
  createdAt: string;
  totalStock: number;
  variants: ProductVariant[];
}

export type StockMovementType =
  | 'INITIAL_BALANCE'
  | 'PURCHASE_IN'
  | 'SALE_OUT'
  | 'RETURN_IN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

export type SalesChannel = 'ERP_POS' | 'WEB_ECOMMERCE' | 'UNITY_META_QUEST';

export interface StockMovement {
  id: string;
  movementType: StockMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost: number | null;
  invoiceNumber?: string | null;
  tagCode?: string | null;
  reason: string | null;
  referenceChannel: SalesChannel | null;
  createdAt: string;
  variantId: string;
  sku: string;
  barcodeEan?: string | null;
  currentStock?: number;
  productId: string;
  productName: string;
  productDescription?: string | null;
  productImageUrl: string | null;
  basePrice?: number;
  costPrice?: number;
  categoryName?: string | null;
  sizeCode: string;
  sizeName?: string;
  colorName: string;
  colorHex: string;
  supplierName: string | null;
  supplierPhone?: string | null;
  orderNumber: number | null;
  customerName?: string | null;
  customerEmail?: string | null;
  orderChannel?: SalesChannel | null;
  orderTotalAmount?: number | null;
  createdByUserName: string | null;
  orderSellerName?: string | null;
}

export interface OrderItem {
  id: string;
  variantId: string;
  sku: string;
  barcodeEan?: string | null;
  productName: string;
  sizeCode: string;
  colorName: string;
  colorHex: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  channel: SalesChannel;
  status: 'PENDING' | 'PAID' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
  customerId?: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerDocument?: string | null;
  invoiceNumber?: string | null;
  invoiceSeries?: string | null;
  invoiceAccessKey?: string | null;
  invoiceIssuedAt?: string | null;
  unitySessionId: string | null;
  totalAmount: number;
  notes: string | null;
  createdAt: string;
  createdByUserId?: string | null;
  createdByUserName: string | null;
  items: OrderItem[];
}

export interface OrdersPaginatedResponse {
  orders: Order[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    filteredRevenue: number;
  };
  filterOptions: {
    sellers: Array<{ id: string; name: string; jobTitle?: string; role: string }>;
    customers: Array<{
      id: string;
      name: string;
      phone: string | null;
      document?: string | null;
    }>;
  };
}

export interface DashboardMovementItem {
  id: string;
  movementType: StockMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost: number | null;
  reason: string | null;
  createdAt: string;
  variantId: string;
  sku: string;
  currentStock: number;
  productId: string;
  productName: string;
  productDescription: string | null;
  productImageUrl: string | null;
  basePrice: number;
  costPrice: number;
  categoryName: string | null;
  sizeCode: string;
  sizeName: string;
  colorName: string;
  colorHex: string;
  supplierName: string | null;
  supplierPhone: string | null;
  createdByUserName: string | null;
  orderNumber: number | null;
  customerName: string | null;
  customerEmail: string | null;
  orderChannel: SalesChannel | null;
  orderTotalAmount: number | null;
  orderSellerName: string | null;
}

export interface DashboardLowStockItem {
  variantId: string;
  sku: string;
  stockQuantity: number;
  minStockAlert: number;
  productId: string;
  productName: string;
  productDescription: string | null;
  productImageUrl: string | null;
  basePrice: number;
  costPrice: number;
  categoryName: string | null;
  sizeCode: string;
  sizeName: string;
  colorName: string;
  colorHex: string;
  supplierName: string | null;
  supplierPhone: string | null;
  leadTimeDays: number | null;
}

export interface DashboardSummary {
  financial: {
    totalRevenue: number;
    totalOrders: number;
    averageTicket: number;
  };
  inventory: {
    totalProducts: number;
    maxProducts: number;
    totalVariants: number;
    totalUnitsInStock: number;
    retailStockValue: number;
    costStockValue: number;
    lowStockCount: number;
  };
  salesByChannel: Array<{
    channel: SalesChannel;
    orders_count: number;
    revenue: number;
  }>;
  recentMovements: DashboardMovementItem[];
  lowStockAlerts: DashboardLowStockItem[];
  unityIntegration: {
    tenantSlug: string;
    unityApiKey: string;
    catalogEndpoint: string;
    checkoutEndpoint: string;
  };
}

export type MetricsSectionFocus =
  | 'financial'
  | 'inventory'
  | 'valuation'
  | 'products';

export interface AnalyticsResponse {
  period: string;
  kpis: {
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    profitMarginPercent: number;
    totalOrders: number;
    averageTicket: number;
    unitsSold: number;
  };
  salesByCategory: Array<{
    categoryName: string;
    unitsSold: number;
    revenue: number;
  }>;
  salesByChannel: Array<{
    channel: SalesChannel;
    ordersCount: number;
    revenue: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    categoryName: string;
    unitsSold: number;
    revenue: number;
    estimatedProfit: number;
  }>;
  salesBySeller: Array<{
    sellerName: string;
    ordersCount: number;
    revenue: number;
  }>;
  movementsBreakdown: Array<{
    movementType: StockMovementType;
    operationsCount: number;
    totalUnits: number;
  }>;
  stockValuation: Array<{
    categoryName: string;
    modelsCount: number;
    unitsInStock: number;
    costValue: number;
    retailValue: number;
  }>;
}
