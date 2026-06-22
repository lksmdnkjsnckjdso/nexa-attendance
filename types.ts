export interface Employee {
  id: string;
  name: string;
  role: string;
  baseSalary: number;
  faceDescriptor: number[] | null; // Serialized Float32Array
  joinedDate: string;
  isActive: boolean;
  leftDate?: string;
  address?: string;
  phoneNumber?: string;
  panCardNumber?: string;
  adhaarCardNumber?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // ISO Date string YYYY-MM-DD
  checkInTime: string | null; // ISO string
  checkOutTime: string | null; // ISO string
  isLate: boolean;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface Settings {
  loginTime: string; // "09:00"
  logoutTime: string; // "17:00"
  latePenaltyAmount: number;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

