
import { supabase } from './supabaseClient';
import { Employee, AttendanceRecord, LeaveRequest, Settings, Holiday } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

// Context
let currentUserEmail: string | null = null;

export const StorageService = {
  // --- Authentication ---

  registerUser: async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const cleanEmail = email.trim();

    // Check existence
    const { data, error: selectError } = await supabase
      .from('app_users')
      .select('email')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (selectError) {
      console.error("Supabase Select Error:", selectError);
      return { success: false, message: `DB Check Failed: ${selectError.message}` };
    }

    if (data) {
      return { success: false, message: "User already exists with this email." };
    }

    const { error: insertError } = await supabase
      .from('app_users')
      .insert([{ email: cleanEmail, password }]);

    if (insertError) {
      console.error("Supabase Insert Error:", insertError);
      return { success: false, message: `Registration Failed: ${insertError.message}` };
    }

    return { success: true };
  },

  loginUser: async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const cleanEmail = email.trim();

    const { data, error } = await supabase
      .from('app_users')
      .select('password')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (error) {
      console.error("Supabase Login Error:", error);
      return { success: false, message: `DB Connection Error: ${error.message}` };
    }

    if (!data) {
      return { success: false, message: "User not found. Please register." };
    }

    if (data.password === password) {
      currentUserEmail = cleanEmail;
      return { success: true };
    } else {
      return { success: false, message: "Invalid password." };
    }
  },

  logoutUser: () => {
    currentUserEmail = null;
  },

  getCurrentUserEmail: () => currentUserEmail,

  // --- Employees ---

  getEmployees: async (): Promise<Employee[]> => {
    if (!currentUserEmail) return [];
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('user_email', currentUserEmail);

    if (error) {
      console.error("Error fetching employees:", error);
      return [];
    }

    // Map snake_case DB columns to camelCase TS interfaces
    return (data || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      role: d.role,
      baseSalary: d.base_salary,
      faceDescriptor: d.face_descriptor ? Object.values(d.face_descriptor) : null,
      joinedDate: d.joined_date,
      isActive: d.is_active ?? true, // Default to true for backward compatibility
      leftDate: d.left_date,
      address: d.address,
      phoneNumber: d.phone_number,
      panCardNumber: d.pan_card_number,
      adhaarCardNumber: d.adhaar_card_number
    }));
  },

  addOrUpdateEmployee: async (employee: Employee): Promise<{ error: any }> => {
    if (!currentUserEmail) return { error: "User not logged in" };
    const dbPayload = {
      id: employee.id,
      user_email: currentUserEmail,
      name: employee.name,
      role: employee.role,
      base_salary: employee.baseSalary,
      face_descriptor: employee.faceDescriptor, // Supabase handles JSONB
      joined_date: employee.joinedDate,
      is_active: employee.isActive,
      left_date: employee.leftDate,
      address: employee.address,
      phone_number: employee.phoneNumber,
      pan_card_number: employee.panCardNumber,
      adhaar_card_number: employee.adhaarCardNumber
    };
    const { error } = await supabase.from('employees').upsert(dbPayload);
    if (error) {
      console.error("Error saving employee:", error);
      return { error };
    }
    return { error: null };
  },

  deleteEmployee: async (id: string) => {
    if (!currentUserEmail) return;
    const { error } = await supabase.from('employees').delete().eq('id', id).eq('user_email', currentUserEmail);
    if (error) console.error("Error deleting employee:", error);
  },

  updateEmployeeStatus: async (id: string, isActive: boolean, leftDate?: string | null) => {
    if (!currentUserEmail) return;

    const payload: any = { is_active: isActive };
    if (leftDate !== undefined) {
      payload.left_date = leftDate;
    }

    // We use explicit update matched by ID and email (for safety)
    const { error } = await supabase
      .from('employees')
      .update(payload)
      .eq('id', id)
      .eq('user_email', currentUserEmail);

    if (error) {
      console.error("Error updating employee status:", error);
      return { error };
    }
    return { error: null };
  },

  // --- Attendance ---

  getAttendance: async (): Promise<AttendanceRecord[]> => {
    if (!currentUserEmail) return [];
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_email', currentUserEmail);

    if (error) {
      console.error("Error fetching attendance:", error);
      return [];
    }

    return (data || []).map((d: any) => ({
      id: d.id,
      employeeId: d.employee_id,
      date: d.date,
      checkInTime: d.check_in_time,
      checkOutTime: d.check_out_time,
      isLate: d.is_late
    }));
  },

  addOrUpdateAttendance: async (record: AttendanceRecord): Promise<{ error: any }> => {
    if (!currentUserEmail) return { error: "User not logged in" };
    const dbPayload = {
      id: record.id,
      user_email: currentUserEmail,
      employee_id: record.employeeId,
      date: record.date,
      check_in_time: record.checkInTime,
      check_out_time: record.checkOutTime,
      is_late: record.isLate
    };
    const { error } = await supabase.from('attendance').upsert(dbPayload);
    if (error) {
      console.error("Error saving attendance:", error);
      return { error };
    }
    return { error: null };
  },

  deleteAttendance: async (id: string) => {
    if (!currentUserEmail) return;
    const { error } = await supabase.from('attendance').delete().eq('id', id).eq('user_email', currentUserEmail);
    if (error) console.error("Error deleting attendance record:", error);
  },

  deleteAttendanceForEmployee: async (employeeId: string) => {
    if (!currentUserEmail) return;
    await supabase.from('attendance').delete().eq('employee_id', employeeId).eq('user_email', currentUserEmail);
  },

  // --- Leaves ---

  getLeaves: async (): Promise<LeaveRequest[]> => {
    if (!currentUserEmail) return [];
    const { data, error } = await supabase
      .from('leaves')
      .select('*')
      .eq('user_email', currentUserEmail);

    if (error) {
      console.error("Error fetching leaves:", error);
      return [];
    }

    return (data || []).map((d: any) => ({
      id: d.id,
      employeeId: d.employee_id,
      startDate: d.start_date,
      endDate: d.end_date,
      reason: d.reason,
      status: d.status
    }));
  },

  addOrUpdateLeave: async (leave: LeaveRequest) => {
    if (!currentUserEmail) return;
    const dbPayload = {
      id: leave.id,
      user_email: currentUserEmail,
      employee_id: leave.employeeId,
      start_date: leave.startDate,
      end_date: leave.endDate,
      reason: leave.reason,
      status: leave.status
    };
    const { error } = await supabase.from('leaves').upsert(dbPayload);
    if (error) console.error("Error saving leave:", error);
  },

  deleteLeavesForEmployee: async (employeeId: string) => {
    if (!currentUserEmail) return;
    await supabase.from('leaves').delete().eq('employee_id', employeeId).eq('user_email', currentUserEmail);
  },

  // --- Holidays ---

  getHolidays: async (): Promise<Holiday[]> => {
    if (!currentUserEmail) return [];
    const { data, error } = await supabase
      .from('holidays')
      .select('*')
      .eq('user_email', currentUserEmail);

    if (error) {
      console.error("Error fetching holidays:", error);
      return [];
    }
    return data || [];
  },

  addHoliday: async (holiday: Holiday) => {
    if (!currentUserEmail) return;
    const { error } = await supabase.from('holidays').insert([{ ...holiday, user_email: currentUserEmail }]);
    if (error) console.error("Error adding holiday:", error);
  },

  deleteHoliday: async (id: string) => {
    if (!currentUserEmail) return;
    const { error } = await supabase.from('holidays').delete().eq('id', id).eq('user_email', currentUserEmail);
    if (error) console.error("Error deleting holiday:", error);
  },

  // --- Settings ---

  getSettings: async (): Promise<Settings> => {
    if (!currentUserEmail) return DEFAULT_SETTINGS;
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_email', currentUserEmail)
      .maybeSingle();

    if (error) console.error("Error fetching settings:", error);
    if (!data) return DEFAULT_SETTINGS;

    return {
      loginTime: data.login_time,
      logoutTime: data.logout_time,
      latePenaltyAmount: data.late_penalty_amount
    };
  },

  saveSettings: async (settings: Settings) => {
    if (!currentUserEmail) return;
    const dbPayload = {
      user_email: currentUserEmail,
      login_time: settings.loginTime,
      logout_time: settings.logoutTime,
      late_penalty_amount: settings.latePenaltyAmount
    };
    const { error } = await supabase.from('settings').upsert(dbPayload);
    if (error) console.error("Error saving settings:", error);
  }
};
