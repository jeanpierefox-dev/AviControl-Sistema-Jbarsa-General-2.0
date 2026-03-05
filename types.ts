export enum UserRole {
  ADMIN = 'ADMIN',
  GENERAL = 'GENERAL',
  OPERATOR = 'OPERATOR'
}

export interface User {
  id: string;
  username: string;
  password?: string; // stored plainly for demo purposes only
  name: string;
  role: UserRole;
  parentId?: string; // Who created this user (for GENERAL users managing OPERATORS)
  allowedModes?: WeighingType[]; // Specific permissions
}

export enum WeighingType {
  BATCH = 'BATCH', // Lote
  SOLO_POLLO = 'SOLO_POLLO',
  SOLO_JABAS = 'SOLO_JABAS'
}

export interface WeighingRecord {
  id: string;
  timestamp: number;
  weight: number;
  quantity: number; // Number of crates or chickens in this specific weigh
  birds?: number; // Number of birds in this specific weigh
  type: 'FULL' | 'EMPTY' | 'MORTALITY';
}

export interface ClientOrder {
  id: string;
  clientName: string;
  targetCrates: number;
  birdsPerCrate?: number; // Default birds per crate for this order
  pricePerKg: number;
  status: 'OPEN' | 'CLOSED';
  records: WeighingRecord[];
  batchId?: string; // Optional if solo mode
  weighingMode?: WeighingType; // To distinguish in collections
  paymentStatus: 'PENDING' | 'PAID';
  paymentMethod?: 'CASH' | 'CREDIT';
  payments: Payment[];
  createdBy?: string; // User ID
}

export interface Payment {
  id: string;
  amount: number;
  timestamp: number;
  note?: string;
}

export interface Batch {
  id: string;
  name: string;
  createdAt: number;
  totalCratesLimit: number; // Estimated capacity
  status: 'ACTIVE' | 'ARCHIVED';
  createdBy?: string; // User ID
}

export interface AppConfig {
  companyName: string;
  logoUrl: string; // Base64 or URL
  printerConnected: boolean;
  scaleConnected: boolean;
  defaultFullCrateBatch: number; // e.g., 5
  defaultEmptyCrateBatch: number; // e.g., 10
  // Cloud Config
  organizationId?: string;
  firebaseConfig?: {
    apiKey: string;
    authDomain?: string;
    projectId: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
    databaseURL?: string;
  };
}