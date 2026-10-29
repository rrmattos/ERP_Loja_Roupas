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
  slug: string;
  isDemo: boolean;
  isSandbox: boolean;
  maxProducts: number;
  expiresAt: string | null;
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
  leadTimeDays: number;
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
  reason: string | null;
  referenceChannel: SalesChannel | null;
  createdAt: string;
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  sizeCode: string;
  colorName: string;
  colorHex: string;
  supplierName: string | null;
  orderNumber: number | null;
  createdByUserName: string | null;
}

export interface OrderItem {
  id: string;
  variantId: string;
  sku: string;
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
  customerName: string | null;
  customerEmail: string | null;
  unitySessionId: string | null;
  totalAmount: number;
  notes: string | null;
  createdAt: string;
  createdByUserName: string | null;
  items: OrderItem[];
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
  recentMovements: Array<{
    id: string;
    movementType: StockMovementType;
    quantity: number;
    previousStock: number;
    newStock: number;
    reason: string | null;
    createdAt: string;
    sku: string;
    productName: string;
    sizeCode: string;
    colorName: string;
    colorHex: string;
  }>;
  lowStockAlerts: Array<{
    variantId: string;
    sku: string;
    stockQuantity: number;
    minStockAlert: number;
    productName: string;
    sizeCode: string;
    colorName: string;
    colorHex: string;
  }>;
  unityIntegration: {
    tenantSlug: string;
    unityApiKey: string;
    catalogEndpoint: string;
    checkoutEndpoint: string;
  };
}

