
import React, { useState, useEffect } from 'react';
import { StorageService } from './services/storage';
import { FaceScanner } from './components/FaceScanner';
import { Payslip } from './components/Payslip';
import { Employee, AttendanceRecord, LeaveRequest, Settings, Holiday } from './types';
import { ADMIN_CODE, DEFAULT_SETTINGS, FACE_MATCH_THRESHOLD, formatCurrency } from './constants';
import { format, differenceInMinutes, parse, isSameDay, startOfMonth, endOfMonth } from 'date-fns';
import { euclideanDistance } from './services/faceRecognition';
import {
    Users, Calendar, Clock, DollarSign, LogOut, Plus, Trash2,
    CheckCircle, XCircle, FileText, UserCheck, Shield, Pencil, X, Mail, Lock, List, Loader2, AlertTriangle, Settings as SettingsIcon
} from 'lucide-react';

// Main Component
const App: React.FC = () => {
    // Global Auth State
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authEmail, setAuthEmail] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [authLoading, setAuthLoading] = useState(false);

    // App State
    const [view, setView] = useState<'LOGIN' | 'ADMIN' | 'EMPLOYEE'>('LOGIN');
    const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
    const [currentUser, setCurrentUser] = useState<Employee | null>(null);
    const [loadingData, setLoadingData] = useState(false);

    // Admin UI State
    const [adminTab, setAdminTab] = useState<'EMPLOYEES' | 'PAYSLIPS' | 'ATTENDANCE' | 'LEAVES' | 'HOLIDAYS' | 'SETTINGS' | 'REPORT'>('EMPLOYEES');

    // Data State
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

    // UI State
    const [adminCodeInput, setAdminCodeInput] = useState('');
    const [showFaceScanner, setShowFaceScanner] = useState(false);
    const [scanMode, setScanMode] = useState<'REGISTER' | 'LOGIN' | 'LOGOUT'>('LOGIN');
    const [scanMessage, setScanMessage] = useState('');
    const [showPayslip, setShowPayslip] = useState(false);
    const [notification, setNotification] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
    const [attendanceViewMode, setAttendanceViewMode] = useState<'DAILY' | 'MONTHLY'>('DAILY');
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
            const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
            const isSmallScreen = window.innerWidth < 1024;
            setIsMobile(isMobileDevice || isSmallScreen);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (isMobile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8 text-center">
                <div>
                    <h1 className="text-3xl font-bold mb-4">Desktop Only</h1>
                    <p className="text-gray-400">This application is designed for desktop use only. Please access it from a computer.</p>
                </div>
            </div>
        );
    }

    // Admin specific UI state
    const [adminPayslipEmployee, setAdminPayslipEmployee] = useState<Employee | null>(null);
    const [selectedPayslipMonth, setSelectedPayslipMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [showFormerEmployees, setShowFormerEmployees] = useState(false);

    // Forms
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newEmployee, setNewEmployee] = useState<Partial<Employee>>({
        name: '', role: '', baseSalary: 0, address: '', phoneNumber: '', panCardNumber: '', adhaarCardNumber: ''
    });

    const [manualAttendance, setManualAttendance] = useState({
        employeeId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        checkInTime: '09:00',
        checkOutTime: ''
    });

    const notify = (msg: string, type: 'success' | 'error') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const loadData = async () => {
        setLoadingData(true);
        try {
            const [empData, attData, leaveData, holidayData, settingsData] = await Promise.all([
                StorageService.getEmployees(),
                StorageService.getAttendance(),
                StorageService.getLeaves(),
                StorageService.getHolidays(),
                StorageService.getSettings()
            ]);
            setEmployees(empData);
            setAttendance(attData);
            setLeaves(leaveData);
            setHolidays(holidayData);
            setSettings(settingsData);
        } catch (e) {
            console.error("Failed to load data", e);
            notify("Failed to connect to database", "error");
        } finally {
            setLoadingData(false);
        }
    };

    // --- Auth Handlers ---
    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!authEmail || !authPassword) {
            notify("Please enter email and password", "error");
            return;
        }

        setAuthLoading(true);
        try {
            if (isRegistering) {
                const result = await StorageService.registerUser(authEmail, authPassword);
                if (result.success) {
                    notify("Registration successful! Please login.", "success");
                    setIsRegistering(false);
                } else {
                    notify(result.message || "Registration failed.", "error");
                }
            } else {
                const result = await StorageService.loginUser(authEmail, authPassword);
                if (result.success) {
                    setIsAuthenticated(true);
                    await loadData(); // Load data specific to this user
                    notify("Login successful", "success");
                } else {
                    notify(result.message || "Login failed.", "error");
                }
            }
        } catch (err: any) {
            notify(`An unexpected error occurred: ${err.message}`, "error");
            console.error(err);
        } finally {
            setAuthLoading(false);
        }
    };

    const handleLogout = () => {
        StorageService.logoutUser();
        setIsAuthenticated(false);
        setAuthEmail('');
        setAuthPassword('');
        setView('LOGIN');
        setIsAdminLoggedIn(false);
        setCurrentUser(null);
    };

    // --- Admin Functions ---

    const handleAdminLogin = () => {
        if (adminCodeInput === ADMIN_CODE) {
            setIsAdminLoggedIn(true);
            setView('ADMIN');
            notify("Welcome, Admin", 'success');
        } else {
            notify("Invalid Admin Code", 'error');
        }
    };

    const handleSaveEmployee = async () => {
        if (!newEmployee.name || !newEmployee.role || !newEmployee.baseSalary) {
            notify("Please fill all required fields (Name, Role, Salary)", 'error');
            return;
        }

        if (editingId) {
            // Update existing
            const updatedEmp = employees.find(e => e.id === editingId);
            if (updatedEmp) {
                const newEmpData = {
                    ...updatedEmp,
                    ...newEmployee,
                    baseSalary: Number(newEmployee.baseSalary)
                } as Employee;

                // Optimistic update
                setEmployees(prev => prev.map(e => e.id === editingId ? newEmpData : e));
                const result = await StorageService.addOrUpdateEmployee(newEmpData);
                if (result.error) {
                    notify("Failed to update employee in database. Please try again.", "error");
                    // Revert optimistic update ? Complex without full store. For now just warn.
                } else {
                    notify("Employee details updated successfully", 'success');
                    resetEmployeeForm();
                }
            }
        } else {
            // Add new - requires face scan
            setScanMode('REGISTER');
            setScanMessage(`Scanning face for ${newEmployee.name}`);
            setShowFaceScanner(true);
        }
    };

    const handleFaceRegister = async (descriptor: Float32Array) => {
        // Use crypto.randomUUID() if available, else fallback to random string
        const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);

        const employee: Employee = {
            id,
            name: newEmployee.name!,
            role: newEmployee.role!,
            baseSalary: Number(newEmployee.baseSalary),
            address: newEmployee.address,
            phoneNumber: newEmployee.phoneNumber,
            panCardNumber: newEmployee.panCardNumber,
            adhaarCardNumber: newEmployee.adhaarCardNumber,
            faceDescriptor: Array.from(descriptor),
            joinedDate: new Date().toISOString(),
            isActive: true
        };

        // Optimistic Update
        setEmployees(prev => [...prev, employee]);

        const result = await StorageService.addOrUpdateEmployee(employee);

        if (result.error) {
            console.error("Save failed:", result.error);
            notify(`Failed to save: ${result.error.message || JSON.stringify(result.error)}`, "error");
            setEmployees(prev => prev.filter(e => e.id !== id)); // Revert
        } else {
            notify("Employee registered successfully!", 'success');
            resetEmployeeForm();
        }

        setShowFaceScanner(false);
    };

    const markAsLeft = async (id: string, e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (!window.confirm("Mark this employee as having left the company? Their past data will be saved, but they will be deactivated.")) {
            return;
        }

        const emp = employees.find(e => e.id === id);
        if (emp) {
            const updatedEmp = { ...emp, isActive: false, leftDate: new Date().toISOString() };
            setEmployees(prev => prev.map(e => e.id === id ? updatedEmp : e));
            await StorageService.updateEmployeeStatus(id, false, updatedEmp.leftDate);
            notify(`${emp.name} marked as Left`, 'success');
        }
    };

    const startEdit = (emp: Employee) => {
        setNewEmployee({
            name: emp.name,
            role: emp.role,
            baseSalary: emp.baseSalary,
            address: emp.address || '',
            phoneNumber: emp.phoneNumber || '',
            panCardNumber: emp.panCardNumber || '',
            adhaarCardNumber: emp.adhaarCardNumber || ''
        });
        setEditingId(emp.id);
        setAdminTab('EMPLOYEES'); // Ensure we are on the correct tab
    };

    const resetEmployeeForm = () => {
        setNewEmployee({ name: '', role: '', baseSalary: 0, address: '', phoneNumber: '', panCardNumber: '', adhaarCardNumber: '' });
        setEditingId(null);
    };

    const restoreEmployee = async (id: string) => {
        const emp = employees.find(e => e.id === id);
        if (emp) {
            const updatedEmp = { ...emp, isActive: true, leftDate: undefined };
            setEmployees(prev => prev.map(e => e.id === id ? updatedEmp : e));
            await StorageService.updateEmployeeStatus(id, true, null);
            notify(`${emp.name} restored to Active`, 'success');
        }
    };

    const deleteEmployee = async (id: string, e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (!window.confirm("Are you sure you want to delete this employee? This will also remove their attendance and leave records.")) {
            return;
        }

        try {
            // Optimistic UI updates
            setEmployees(current => current.filter(e => e.id !== id));
            setAttendance(current => current.filter(a => a.employeeId !== id));
            setLeaves(current => current.filter(l => l.employeeId !== id));

            // DB Updates
            await StorageService.deleteEmployee(id); // Supabase Foreign keys should cascade, but manual delete is safe
            // If cascade is not set up in DB, we would need:
            // await StorageService.deleteAttendanceForEmployee(id);
            // await StorageService.deleteLeavesForEmployee(id);

            notify("Employee and related data deleted", 'success');

            if (editingId === id) {
                resetEmployeeForm();
            }
        } catch (err) {
            console.error(err);
            notify("Failed to delete employee", 'error');
            // Revert optimization if needed (omitted for brevity)
        }
    };

    const updateSettings = async (key: keyof Settings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        await StorageService.saveSettings(newSettings);
    };

    const handleLeaveAction = async (id: string, status: 'APPROVED' | 'REJECTED') => {
        const leave = leaves.find(l => l.id === id);
        if (leave) {
            const updatedLeave = { ...leave, status };
            setLeaves(prev => prev.map(l => l.id === id ? updatedLeave : l));
            await StorageService.addOrUpdateLeave(updatedLeave);
            notify(`Leave ${status.toLowerCase()}`, status === 'APPROVED' ? 'success' : 'error');
        }
    };

    const addHoliday = async (date: string, name: string) => {
        const newHoliday: Holiday = { id: Date.now().toString(), date, name };
        setHolidays(prev => [...prev, newHoliday]);
        await StorageService.addHoliday(newHoliday);
        notify("Holiday added", 'success');
    };

    const deleteHoliday = async (id: string) => {
        setHolidays(prev => prev.filter(h => h.id !== id));
        await StorageService.deleteHoliday(id);
    };

    const handleManualAttendanceSubmit = async () => {
        if (!manualAttendance.employeeId || !manualAttendance.date || !manualAttendance.checkInTime) {
            notify("Please select employee, date and check-in time", 'error');
            return;
        }

        const emp = employees.find(e => e.id === manualAttendance.employeeId);
        if (!emp) return;

        const checkInDateTime = parse(`${manualAttendance.date} ${manualAttendance.checkInTime}`, 'yyyy-MM-dd HH:mm', new Date());
        let checkOutDateTime = null;
        if (manualAttendance.checkOutTime) {
            checkOutDateTime = parse(`${manualAttendance.date} ${manualAttendance.checkOutTime}`, 'yyyy-MM-dd HH:mm', new Date());
        }

        // Calculate Late
        const [loginHours, loginMinutes] = settings.loginTime.split(':').map(Number);
        const loginTimeForDate = new Date(checkInDateTime);
        loginTimeForDate.setHours(loginHours, loginMinutes, 0, 0);

        const diffMinutes = differenceInMinutes(checkInDateTime, loginTimeForDate);
        const isLate = diffMinutes >= 10;

        const newRecord: AttendanceRecord = {
            id: Date.now().toString(),
            employeeId: emp.id,
            date: manualAttendance.date,
            checkInTime: checkInDateTime.toISOString(),
            checkOutTime: checkOutDateTime ? checkOutDateTime.toISOString() : null,
            isLate
        };

        // Check if record exists for this day and employee to update or add
        const existingIndex = attendance.findIndex(a => a.employeeId === emp.id && a.date === manualAttendance.date);

        if (existingIndex >= 0) {
            // Update
            const updatedRecord = { ...attendance[existingIndex], ...newRecord, id: attendance[existingIndex].id };
            setAttendance(prev => prev.map((a, i) => i === existingIndex ? updatedRecord : a));
            await StorageService.addOrUpdateAttendance(updatedRecord);
            notify("Attendance updated manually", 'success');
        } else {
            // Add
            setAttendance(prev => [...prev, newRecord]);
            await StorageService.addOrUpdateAttendance(newRecord);
            notify("Attendance added manually", 'success');
        }

        // Reset form (optional, maybe keep date)
        setManualAttendance(prev => ({ ...prev, employeeId: '' }));
    };

    const toggleLate = async (record: AttendanceRecord) => {
        const updatedRecord = { ...record, isLate: !record.isLate };
        setAttendance(prev => prev.map(a => a.id === record.id ? updatedRecord : a));
        await StorageService.addOrUpdateAttendance(updatedRecord);
        notify(updatedRecord.isLate ? "Marked as Late" : "Marked as On Time", 'success');
    };

    const markAbsent = async (recordId: string) => {
        if (!window.confirm("Are you sure you want to mark this employee as absent? This will delete the attendance record.")) return;
        setAttendance(prev => prev.filter(a => a.id !== recordId));
        await StorageService.deleteAttendance(recordId);
        notify("Employee marked as absent (Record deleted)", 'success');
    };

    // Helper for attendance log
    const getAttendanceByDate = () => {
        const grouped: Record<string, AttendanceRecord[]> = {};
        attendance.forEach(r => {
            if (!grouped[r.date]) grouped[r.date] = [];
            grouped[r.date].push(r);
        });
        // Sort keys (dates) descending
        return Object.entries(grouped).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
    };

    // --- Employee Functions ---

    const handleFaceLogin = async (descriptor: Float32Array) => {
        try {
            let bestMatch = { distance: FACE_MATCH_THRESHOLD, employee: null as Employee | null };

            employees.filter(e => e.isActive).forEach(emp => {
                if (emp.faceDescriptor) {
                    const distance = euclideanDistance(descriptor, emp.faceDescriptor);
                    if (distance < bestMatch.distance) {
                        bestMatch = { distance, employee: emp };
                    }
                }
            });

            if (bestMatch.employee) {
                setShowFaceScanner(false);
                if (scanMode === 'LOGIN') {
                    await processAttendance(bestMatch.employee);
                } else if (scanMode === 'LOGOUT') {
                    await processLogout(bestMatch.employee);
                }
            } else {
                notify("Face not recognized. Please try again.", 'error');
            }
        } catch (err) {
            console.error("Face login error:", err);
            notify("An error occurred during face recognition. Please try again.", 'error');
        }
    };

    const processAttendance = async (employee: Employee) => {
        const today = new Date().toISOString().split('T')[0];
        const existing = attendance.find(a => a.employeeId === employee.id && a.date === today);

        if (existing) {
            notify(`Welcome back, ${employee.name}. You already checked in.`, 'success');
            setCurrentUser(employee);
            setView('EMPLOYEE');
            return;
        }

        // Check Late Logic
        const now = new Date();

        // Robust parsing of login time
        const [loginHours, loginMinutes] = settings.loginTime.split(':').map(Number);
        const loginTime = new Date(now);
        loginTime.setHours(loginHours, loginMinutes, 0, 0);

        // Late if >= 10 mins after loginTime
        const diffMinutes = differenceInMinutes(now, loginTime);
        const isLate = diffMinutes >= 10;

        const newRecord: AttendanceRecord = {
            id: Date.now().toString(),
            employeeId: employee.id,
            date: today,
            checkInTime: now.toISOString(),
            checkOutTime: null,
            isLate
        };

        setAttendance(prev => [...prev, newRecord]);
        const result = await StorageService.addOrUpdateAttendance(newRecord);

        if (result.error) {
            setAttendance(prev => prev.filter(a => a.id !== newRecord.id));
            notify("Failed to save attendance. Please try again.", 'error');
            return;
        }

        setCurrentUser(employee);
        setView('EMPLOYEE');

        if (isLate) {
            notify(`Checked in. You are ${diffMinutes} minutes late (Limit: 10m).`, 'error');
        } else {
            notify(`Checked in successfully! (On Time)`, 'success');
        }
    };

    const processLogout = async (employee: Employee) => {
        const today = new Date().toISOString().split('T')[0];
        const existing = attendance.find(a => a.employeeId === employee.id && a.date === today);

        if (!existing) {
            notify("You haven't checked in today.", 'error');
            return;
        }

        if (existing.checkOutTime) {
            notify("You have already checked out today.", 'error');
            return;
        }

        const updatedRecord = { ...existing, checkOutTime: new Date().toISOString() };

        setAttendance(prev => prev.map(a => a.id === existing.id ? updatedRecord : a));
        const result = await StorageService.addOrUpdateAttendance(updatedRecord);

        if (result.error) {
            setAttendance(prev => prev.map(a => a.id === existing.id ? existing : a));
            notify("Failed to save checkout. Please try again.", 'error');
            return;
        }

        notify("Goodbye! Checked out.", 'success');
        setShowFaceScanner(false);
    };

    const applyLeave = async (startDate: string, endDate: string, reason: string) => {
        if (!currentUser) return;
        const request: LeaveRequest = {
            id: Date.now().toString(),
            employeeId: currentUser.id,
            startDate,
            endDate,
            reason,
            status: 'PENDING'
        };

        setLeaves(prev => [...prev, request]);
        await StorageService.addOrUpdateLeave(request);
        notify("Leave application submitted", 'success');
    };

    // --- Initial Auth View ---

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                {notification && (
                    <div className={`fixed top-5 right-5 p-4 rounded text-white shadow-lg z-50 ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'} flex items-center gap-2 max-w-sm break-words`}>
                        {notification.type === 'error' && <AlertTriangle size={20} />}
                        {notification.msg}
                    </div>
                )}
                <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md relative">
                    {authLoading && (
                        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-2xl z-10">
                            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
                        </div>
                    )}
                    <div className="text-center mb-8">
                        <img src="/logo.png" alt="Nexa Logo" className="h-20 mx-auto mb-4 object-contain" />
                        <h1 className="text-3xl font-extrabold text-gray-900">Nexa Attendance</h1>
                        <p className="text-gray-500 mt-2">
                            {isRegistering ? "Create your company account" : "Sign in to your dashboard"}
                        </p>
                    </div>

                    <form onSubmit={handleAuthSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
                                <input
                                    type="email"
                                    required
                                    className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="name@company.com"
                                    value={authEmail}
                                    onChange={e => setAuthEmail(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
                                <input
                                    type="password"
                                    required
                                    className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="••••••••"
                                    value={authPassword}
                                    onChange={e => setAuthPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition duration-200">
                            {isRegistering ? "Register Company" : "Login"}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            onClick={() => { setIsRegistering(!isRegistering); setNotification(null); }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                            {isRegistering ? "Already have an account? Login" : "New here? Register your company"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (loadingData) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="animate-spin text-blue-600 w-12 h-12 mx-auto mb-4" />
                    <p className="text-gray-500">Loading your data...</p>
                </div>
            </div>
        );
    }

    // --- Views ---

    if (view === 'LOGIN') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
                {notification && (
                    <div className={`fixed top-5 right-5 p-4 rounded text-white shadow-lg ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                        {notification.msg}
                    </div>
                )}

                <button
                    onClick={handleLogout}
                    className="fixed top-4 right-4 flex items-center gap-2 text-gray-500 hover:text-red-500 bg-white px-4 py-2 rounded shadow-sm"
                >
                    <LogOut size={16} /> Logout {authEmail}
                </button>

                <div className="text-center mb-10">
                    <img src="/logo.png" alt="Nexa Logo" className="h-24 mx-auto mb-6 object-contain" />
                    <h1 className="text-4xl font-extrabold text-gray-900">Nexa Attendance</h1>
                    <p className="text-gray-500 mt-2">Secure Attendance System</p>
                    <p className="text-xs text-gray-400 mt-1">Logged in as {authEmail}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                    {/* Employee Login */}
                    <div className="bg-white p-8 rounded-2xl shadow-lg flex flex-col items-center hover:shadow-xl transition duration-300">
                        <h2 className="text-2xl font-bold mb-6 text-gray-800">Employee Access</h2>
                        <div className="w-full space-y-4">
                            <button
                                onClick={() => { setScanMode('LOGIN'); setScanMessage("Look at the camera to check in"); setShowFaceScanner(true); }}
                                className="w-full py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2"
                            >
                                <UserCheck /> Check In
                            </button>
                            <button
                                onClick={() => { setScanMode('LOGOUT'); setScanMessage("Look at the camera to check out"); setShowFaceScanner(true); }}
                                className="w-full py-4 bg-gray-800 text-white rounded-lg font-semibold hover:bg-gray-900 transition flex items-center justify-center gap-2"
                            >
                                <LogOut /> Check Out
                            </button>
                        </div>
                        <p className="mt-4 text-sm text-gray-400">Scan your face to mark attendance</p>
                    </div>

                    {/* Admin Login */}
                    <div className="bg-white p-8 rounded-2xl shadow-lg flex flex-col items-center hover:shadow-xl transition duration-300">
                        <h2 className="text-2xl font-bold mb-6 text-gray-800">Admin Portal</h2>
                        <div className="w-full space-y-4">
                            <input
                                type="password"
                                placeholder="Enter Admin Code"
                                className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={adminCodeInput}
                                onChange={(e) => setAdminCodeInput(e.target.value)}
                            />
                            <button
                                onClick={handleAdminLogin}
                                className="w-full py-4 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 transition flex items-center justify-center gap-2"
                            >
                                <Shield /> Access Dashboard
                            </button>
                        </div>
                        <p className="mt-4 text-sm text-gray-400">Authorized personnel only</p>
                    </div>
                </div>

                {showFaceScanner && (
                    <FaceScanner
                        isScanning={showFaceScanner}
                        onScan={scanMode === 'REGISTER' ? handleFaceRegister : handleFaceLogin}
                        message={scanMessage}
                        onClose={() => setShowFaceScanner(false)}
                    />
                )}
            </div>
        );
    }

    // --- Admin Dashboard ---
    if (view === 'ADMIN') {
        const tabs = [
            { id: 'EMPLOYEES', label: 'Employees', icon: Users },
            { id: 'PAYSLIPS', label: 'Payslips', icon: DollarSign },
            { id: 'ATTENDANCE', label: 'Attendance', icon: List },
            { id: 'LEAVES', label: 'Leaves', icon: FileText },
            { id: 'HOLIDAYS', label: 'Holidays', icon: Calendar },
            { id: 'REPORT', label: 'Report Sheet', icon: FileText },
            { id: 'SETTINGS', label: 'Settings', icon: SettingsIcon },
        ] as const;

        return (
            <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
                {/* Sidebar (Tabs) */}
                <div className="w-full md:w-64 bg-gray-900 text-white p-6 flex flex-col">
                    <h2 className="text-2xl font-bold mb-8 hidden md:block">Admin Panel</h2>
                    <p className="text-xs text-gray-500 mb-6 break-words hidden md:block">{authEmail}</p>

                    <nav className="flex md:flex-col space-x-2 md:space-x-0 md:space-y-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setAdminTab(tab.id)}
                                className={`flex items-center gap-3 p-3 rounded transition whitespace-nowrap ${adminTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                            >
                                <tab.icon size={20} /> <span>{tab.label}</span>
                            </button>
                        ))}
                    </nav>

                    <div className="mt-auto hidden md:block">
                        <button onClick={() => { setView('LOGIN'); setIsAdminLoggedIn(false); setAdminCodeInput(''); }} className="mt-12 flex items-center gap-2 text-red-400 hover:text-red-300">
                            <LogOut size={16} /> Exit Admin
                        </button>
                    </div>
                </div>

                <div className="flex-1 p-8 overflow-auto h-screen relative">
                    <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                        <h1 className="text-3xl font-bold text-gray-800 capitalize">{adminTab.toLowerCase().replace('_', ' ')}</h1>
                        <div className="flex gap-4 w-full md:w-auto overflow-x-auto">
                            <div className="bg-white p-4 rounded shadow-sm text-center min-w-[120px]">
                                <p className="text-sm text-gray-500">Total Employees</p>
                                <p className="text-xl font-bold">{employees.length}</p>
                            </div>
                            <div className="bg-white p-4 rounded shadow-sm text-center min-w-[120px]">
                                <p className="text-sm text-gray-500">Present Today</p>
                                <p className="text-xl font-bold text-green-600">
                                    {attendance.filter(a => isSameDay(new Date(a.date), new Date())).length}
                                </p>
                            </div>
                            <div className="bg-white p-4 rounded shadow-sm text-center min-w-[120px]">
                                <p className="text-sm text-gray-500">Pending Leaves</p>
                                <p className="text-xl font-bold text-yellow-600">
                                    {leaves.filter(l => l.status === 'PENDING').length}
                                </p>
                            </div>
                        </div>
                    </header>

                    {notification && (
                        <div className={`mb-4 p-4 rounded text-white shadow-sm ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                            {notification.msg}
                        </div>
                    )}

                    {/* --- Tab Content --- */}

                    {adminTab === 'EMPLOYEES' && (
                        <section className="bg-white p-6 rounded-lg shadow mb-8 animate-fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <Users size={20} /> Staff Management
                                    <span className={`text-xs px-2 py-1 rounded-full ${showFormerEmployees ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                                        {showFormerEmployees ? 'Former Employees' : 'Active Staff'}
                                    </span>
                                </h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowFormerEmployees(!showFormerEmployees)}
                                        className="text-sm px-3 py-1 border rounded hover:bg-gray-50 text-gray-600"
                                    >
                                        {showFormerEmployees ? 'Show Active Staff' : 'Show Former Employees'}
                                    </button>
                                    {!showFormerEmployees && (
                                        <button onClick={() => { resetEmployeeForm(); window.scrollTo(0, 0); }} className="md:hidden text-blue-600 text-sm">Add New</button>
                                    )}
                                </div>
                            </div>

                            {/* Add/Edit Form - Only show when managing active employees */}
                            {!showFormerEmployees && (
                                <div className="bg-gray-50 p-4 rounded border mb-6">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-sm font-bold uppercase text-gray-600">
                                            {editingId ? `Editing ${newEmployee.name}` : 'Add New Employee'}
                                        </h4>
                                        {editingId && (
                                            <button onClick={resetEmployeeForm} className="text-xs text-red-500 hover:underline">Cancel Edit</button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <input placeholder="Full Name *" value={newEmployee.name} onChange={e => setNewEmployee({ ...newEmployee, name: e.target.value })} className="border p-2 rounded" />
                                        <input placeholder="Role / Designation *" value={newEmployee.role} onChange={e => setNewEmployee({ ...newEmployee, role: e.target.value })} className="border p-2 rounded" />
                                        <input placeholder="Monthly Salary (₹) *" type="number" value={newEmployee.baseSalary || ''} onChange={e => setNewEmployee({ ...newEmployee, baseSalary: Number(e.target.value) })} className="border p-2 rounded" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                        <input placeholder="Phone Number" value={newEmployee.phoneNumber} onChange={e => setNewEmployee({ ...newEmployee, phoneNumber: e.target.value })} className="border p-2 rounded" />
                                        <input placeholder="PAN Card Number" value={newEmployee.panCardNumber} onChange={e => setNewEmployee({ ...newEmployee, panCardNumber: e.target.value })} className="border p-2 rounded" />
                                        <input placeholder="Adhaar Card Number" value={newEmployee.adhaarCardNumber} onChange={e => setNewEmployee({ ...newEmployee, adhaarCardNumber: e.target.value })} className="border p-2 rounded" />
                                        <input placeholder="Address" value={newEmployee.address} onChange={e => setNewEmployee({ ...newEmployee, address: e.target.value })} className="border p-2 rounded" />
                                    </div>
                                    <div className="flex justify-end">
                                        <button onClick={handleSaveEmployee} className={`${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded px-6 py-2 flex items-center justify-center gap-2`}>
                                            {editingId ? <><CheckCircle size={18} /> Update Data</> : <><Plus size={18} /> Register Face</>}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm text-left text-gray-500">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3">Name</th>
                                            <th className="px-6 py-3">Role</th>
                                            <th className="px-6 py-3">Salary</th>
                                            <th className="px-6 py-3">Status</th>
                                            <th className="px-6 py-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {employees.filter(e => showFormerEmployees ? !e.isActive : e.isActive).map(emp => (
                                            <tr key={emp.id} className="bg-white border-b hover:bg-gray-50">
                                                <td className="px-6 py-4 font-medium text-gray-900">
                                                    {emp.name}
                                                    {emp.leftDate && <div className="text-xs text-red-400">Left: {new Date(emp.leftDate).toLocaleDateString()}</div>}
                                                </td>
                                                <td className="px-6 py-4">{emp.role}</td>
                                                <td className="px-6 py-4">{formatCurrency(emp.baseSalary)}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs ${emp.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {emp.isActive ? 'Active' : 'Left'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 flex gap-3">
                                                    {emp.isActive ? (
                                                        <>
                                                            <button type="button" onClick={() => startEdit(emp)} className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded" title="Edit"><Pencil size={18} /></button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => markAsLeft(emp.id, e)}
                                                                className="text-orange-600 hover:text-orange-900 p-2 hover:bg-orange-50 rounded"
                                                                title="Mark as Left (Archive)"
                                                            >
                                                                <LogOut size={18} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => deleteEmployee(emp.id, e)}
                                                                className="text-gray-400 hover:text-red-600 p-2 hover:bg-red-50 rounded"
                                                                title="Delete Permanently"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => restoreEmployee(emp.id)}
                                                                className="text-green-600 hover:text-green-900 p-2 hover:bg-green-50 rounded font-bold text-xs"
                                                                title="Restore Employee"
                                                            >
                                                                Restore
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => deleteEmployee(emp.id, e)}
                                                                className="text-gray-400 hover:text-red-600 p-2 hover:bg-red-50 rounded"
                                                                title="Delete Permanently"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {employees.filter(e => showFormerEmployees ? !e.isActive : e.isActive).length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                                                    {showFormerEmployees ? "No former employees." : "No active employees found."}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {/* 2. Employee Payslip Column */}
                    {adminTab === 'PAYSLIPS' && (
                        <section className="bg-white p-6 rounded-lg shadow mb-8 animate-fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold flex items-center gap-2"><DollarSign size={20} /> Generate Payslips</h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600">Select Month:</span>
                                    <input
                                        type="month"
                                        value={selectedPayslipMonth}
                                        onChange={(e) => setSelectedPayslipMonth(e.target.value)}
                                        className="border rounded p-1 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm text-left text-gray-500">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3">Employee</th>
                                            <th className="px-6 py-3">Base Salary</th>
                                            <th className="px-6 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {employees.map(emp => (
                                            <tr key={emp.id} className="bg-white border-b hover:bg-gray-50">
                                                <td className="px-6 py-4 font-medium text-gray-900">{emp.name}</td>
                                                <td className="px-6 py-4">{formatCurrency(emp.baseSalary)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => setAdminPayslipEmployee(emp)}
                                                        className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 inline-flex items-center gap-1"
                                                    >
                                                        <FileText size={14} /> View Payslip
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {employees.length === 0 && (
                                            <tr><td colSpan={3} className="p-4 text-center text-gray-400">No employees found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {/* 3. Employee Attendance Table */}
                    {adminTab === 'ATTENDANCE' && (
                        <section className="bg-white p-6 rounded-lg shadow mb-8 animate-fade-in">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold flex items-center gap-2"><List size={20} /> Attendance</h3>
                                <div className="flex gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-600">View Mode:</span>
                                        <div className="flex bg-gray-100 p-1 rounded">
                                            <button
                                                onClick={() => setAttendanceViewMode('DAILY')}
                                                className={`px-3 py-1 text-xs rounded ${attendanceViewMode === 'DAILY' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500'}`}
                                            >
                                                Daily Log
                                            </button>
                                            <button
                                                onClick={() => setAttendanceViewMode('MONTHLY')}
                                                className={`px-3 py-1 text-xs rounded ${attendanceViewMode === 'MONTHLY' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500'}`}
                                            >
                                                Monthly Sheet
                                            </button>
                                        </div>
                                    </div>
                                    {attendanceViewMode === 'MONTHLY' && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-600">Month:</span>
                                            <input
                                                type="month"
                                                value={selectedPayslipMonth}
                                                onChange={(e) => setSelectedPayslipMonth(e.target.value)}
                                                className="border rounded p-1 text-sm outline-none"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {attendanceViewMode === 'DAILY' ? (
                                <>
                                    {/* Manual Attendance Form */}
                                    <div className="bg-checkered-light p-4 rounded border-2 border-dashed border-gray-200 mb-6">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-sm font-bold uppercase text-gray-600">Manual Entry</h4>
                                            <span className="text-xs text-gray-400 bg-white px-2 py-1 rounded border">Admin Override</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Employee</label>
                                                <select
                                                    className="w-full border p-2 rounded text-sm bg-white"
                                                    value={manualAttendance.employeeId}
                                                    onChange={e => setManualAttendance({ ...manualAttendance, employeeId: e.target.value })}
                                                >
                                                    <option value="">Select Employee</option>
                                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Date</label>
                                                <input
                                                    type="date"
                                                    className="w-full border p-2 rounded text-sm"
                                                    value={manualAttendance.date}
                                                    onChange={e => setManualAttendance({ ...manualAttendance, date: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Check In</label>
                                                <input
                                                    type="time"
                                                    className="w-full border p-2 rounded text-sm"
                                                    value={manualAttendance.checkInTime}
                                                    onChange={e => setManualAttendance({ ...manualAttendance, checkInTime: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Check Out</label>
                                                <input
                                                    type="time"
                                                    className="w-full border p-2 rounded text-sm"
                                                    value={manualAttendance.checkOutTime}
                                                    onChange={e => setManualAttendance({ ...manualAttendance, checkOutTime: e.target.value })}
                                                />
                                            </div>
                                            <button
                                                onClick={handleManualAttendanceSubmit}
                                                className="bg-gray-800 text-white p-2 rounded text-sm hover:bg-black font-medium transition-colors"
                                            >
                                                Save Record
                                            </button>
                                        </div>
                                    </div>

                                    <div className="overflow-auto max-h-[600px] border rounded-lg shadow-sm">
                                        <table className="min-w-full text-sm text-left text-gray-500">
                                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
                                                <tr>
                                                    <th className="px-6 py-3 whitespace-nowrap">Date</th>
                                                    <th className="px-6 py-3">Total Present</th>
                                                    <th className="px-6 py-3">Attendance Log</th>
                                                    <th className="px-6 py-3">Late List</th>
                                                    <th className="px-6 py-3">Absent List</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {getAttendanceByDate().map(([date, records]) => {
                                                    const presentEmployeeIds = new Set(records.map(r => r.employeeId));
                                                    const absentEmployees = employees.filter(e => !presentEmployeeIds.has(e.id));
                                                    const lateRecords = records.filter(r => r.isLate);

                                                    return (
                                                        <tr key={date} className="bg-white hover:bg-blue-50/30 transition-colors">
                                                            <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap border-r">
                                                                {format(new Date(date), 'dd MMM yyyy')}
                                                                <div className="text-xs text-gray-400 font-normal">{format(new Date(date), 'EEEE')}</div>
                                                            </td>
                                                            <td className="px-6 py-4 font-bold text-gray-600">
                                                                <span className="text-blue-600 text-lg">{records.length}</span> / {employees.length}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-wrap gap-2">
                                                                    {records.map(r => {
                                                                        const emp = employees.find(e => e.id === r.employeeId);
                                                                        return (
                                                                            <span key={r.id} className={`group relative text-xs px-2 py-1 rounded border min-w-[120px] ${r.isLate ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-green-50 border-green-200 text-green-800'} flex flex-col`}>
                                                                                <div className="flex justify-between items-start">
                                                                                    <span className="font-bold truncate max-w-[80px]">{emp?.name || 'Unknown'}</span>
                                                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1 bg-white/90 backdrop-blur-sm rounded shadow-sm p-0.5 z-10 border">
                                                                                        <button
                                                                                            onClick={() => toggleLate(r)}
                                                                                            className={`p-1 rounded hover:bg-gray-100 ${r.isLate ? 'text-green-600' : 'text-yellow-600'}`}
                                                                                            title={r.isLate ? "Mark On Time" : "Mark Late"}
                                                                                        >
                                                                                            <Clock size={12} />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => markAbsent(r.id)}
                                                                                            className="p-1 text-red-600 hover:bg-gray-100 rounded"
                                                                                            title="Mark Absent"
                                                                                        >
                                                                                            <Trash2 size={12} />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                                <span className="text-[10px] opacity-70 mt-1 font-mono">
                                                                                    In: {format(new Date(r.checkInTime), 'HH:mm')}
                                                                                    {r.checkOutTime && ` | Out: ${format(new Date(r.checkOutTime), 'HH:mm')}`}
                                                                                </span>
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-wrap gap-2">
                                                                    {lateRecords.length === 0 ? (
                                                                        <span className="text-xs text-gray-300 italic">None</span>
                                                                    ) : (
                                                                        lateRecords.map(r => {
                                                                            const emp = employees.find(e => e.id === r.employeeId);
                                                                            return (
                                                                                <span key={r.id} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 border border-red-100 font-medium">
                                                                                    {emp?.name || 'Unknown'}
                                                                                </span>
                                                                            );
                                                                        })
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-wrap gap-2">
                                                                    {absentEmployees.map(emp => (
                                                                        <span key={emp.id} className="text-xs px-2 py-1 rounded border bg-gray-50 text-gray-500">
                                                                            {emp.name}
                                                                        </span>
                                                                    ))}
                                                                    {absentEmployees.length === 0 && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle size={10} /> Full Attendance</span>}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {attendance.length === 0 && (
                                                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">No attendance data found.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <div className="overflow-x-auto border rounded-lg shadow-sm">
                                    <table className="min-w-full text-xs text-center border-collapse table-fixed">
                                        <thead>
                                            <tr>
                                                <th className="p-2 border bg-gray-100 text-left w-[150px] sticky left-0 z-20 shadow-sm">Employee</th>
                                                {(() => {
                                                    const monthDate = parse(selectedPayslipMonth, 'yyyy-MM', new Date());
                                                    const safeMonthDate = isNaN(monthDate.getTime()) ? new Date() : monthDate;
                                                    const daysInMonth = new Date(safeMonthDate.getFullYear(), safeMonthDate.getMonth() + 1, 0).getDate();
                                                    return Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
                                                        <th key={day} className="p-1 border bg-gray-50 w-[60px] text-gray-600 font-medium text-[10px]">
                                                            {day}
                                                        </th>
                                                    ));
                                                })()}
                                                <th className="p-2 border bg-gray-100 w-[50px] text-green-700">P</th>
                                                <th className="p-2 border bg-gray-100 w-[50px] text-red-700">A</th>
                                                <th className="p-2 border bg-gray-100 w-[50px] text-orange-700">L</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {employees.filter(emp => emp.isActive).map(emp => {
                                                const monthDate = parse(selectedPayslipMonth, 'yyyy-MM', new Date());
                                                const safeMonthDate = isNaN(monthDate.getTime()) ? new Date() : monthDate;
                                                const daysInMonth = new Date(safeMonthDate.getFullYear(), safeMonthDate.getMonth() + 1, 0).getDate();
                                                const year = safeMonthDate.getFullYear();
                                                const month = safeMonthDate.getMonth();

                                                // Pre-calculate stats for this row
                                                let pCount = 0;
                                                let aCount = 0;
                                                let lCount = 0;

                                                const daysCells = Array.from({ length: daysInMonth }, (_, i) => {
                                                    const day = i + 1;
                                                    const current = new Date(year, month, day);
                                                    const dateStr = format(current, 'yyyy-MM-dd');
                                                    const record = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
                                                    const isHoliday = holidays.some(h => h.date === dateStr);
                                                    const isSunday = current.getDay() === 0;

                                                    let content = <span className="text-gray-200">-</span>;
                                                    let bgClass = "bg-white";

                                                    if (isHoliday) {
                                                        content = <span className="text-purple-600 font-bold" title="Holiday">H</span>;
                                                        bgClass = "bg-purple-50";
                                                    } else if (isSunday) {
                                                        content = <span className="text-gray-400" title="Sunday">S</span>;
                                                        bgClass = "bg-gray-50";
                                                    } else if (record) {
                                                        pCount++;
                                                        const inTime = record.checkInTime ? format(new Date(record.checkInTime), 'HH:mm') : '--';
                                                        const outTime = record.checkOutTime ? format(new Date(record.checkOutTime), 'HH:mm') : '--';

                                                        if (record.isLate) {
                                                            lCount++;
                                                            content = (
                                                                <div className="w-full h-full flex flex-col items-center justify-center bg-yellow-100 text-yellow-800 text-[9px] leading-tight py-1" title="Late">
                                                                    <span className="font-bold mb-0.5">L</span>
                                                                    <span>{inTime}</span>
                                                                    <span>{outTime}</span>
                                                                </div>
                                                            );
                                                        } else {
                                                            content = (
                                                                <div className="w-full h-full flex flex-col items-center justify-center bg-green-100 text-green-800 text-[9px] leading-tight py-1" title="Present">
                                                                    <span className="font-bold mb-0.5">P</span>
                                                                    <span>{inTime}</span>
                                                                    <span>{outTime}</span>
                                                                </div>
                                                            );
                                                        }
                                                    } else {
                                                        // Absent logic: if date is in past/today and not attendance
                                                        if (current <= new Date()) {
                                                            aCount++;
                                                            content = <div className="w-full h-full flex items-center justify-center bg-red-50 text-red-500 font-bold" title="Absent">A</div>;
                                                        }
                                                    }

                                                    return <td key={day} className={`border p-0 ${bgClass} h-12 align-top overflow-hidden`}>{content}</td>;
                                                });

                                                return (
                                                    <tr key={emp.id} className="hover:bg-gray-50">
                                                        <td className="p-2 border font-medium text-left truncate sticky left-0 bg-white z-10 shadow-sm border-r-gray-200">{emp.name}</td>
                                                        {daysCells}
                                                        <td className="p-2 border font-bold text-green-600 bg-green-50/50">{pCount}</td>
                                                        <td className="p-2 border font-bold text-red-600 bg-red-50/50">{aCount}</td>
                                                        <td className="p-2 border font-bold text-orange-600 bg-orange-50/50">{lCount}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    )}

                    {/* 7. Report Sheet */}
                    {adminTab === 'REPORT' && (
                        <section className="bg-white p-6 rounded-lg shadow mb-8 animate-fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold flex items-center gap-2"><FileText size={20} /> Monthly Report Sheet</h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600">Select Month:</span>
                                    <input
                                        type="month"
                                        value={selectedPayslipMonth}
                                        onChange={(e) => setSelectedPayslipMonth(e.target.value)}
                                        className="border rounded p-1 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm text-left text-gray-500 border-collapse border">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                        <tr>
                                            <th className="border p-3">Employee Name</th>
                                            <th className="border p-3">Role</th>
                                            <th className="border p-3 text-center">Total Days</th>
                                            <th className="border p-3 text-center text-green-700">Present</th>
                                            <th className="border p-3 text-center text-red-700">Absent</th>
                                            <th className="border p-3 text-center text-orange-700">Late Marks</th>
                                            <th className="border p-3 text-right">Base Salary</th>
                                            <th className="border p-3 text-right text-red-600">Deductions</th>
                                            <th className="border p-3 text-right font-bold text-blue-700">Net Payable</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {employees.filter(emp => emp.isActive).map(emp => {
                                            // Calculation Logic (Duplicated from Payslip for summary)
                                            const monthDate = parse(selectedPayslipMonth, 'yyyy-MM', new Date());
                                            // Handle invalid date if parse fails
                                            const safeMonthDate = isNaN(monthDate.getTime()) ? new Date() : monthDate;

                                            // Get days in month using date-fns v4 helper or standard JS
                                            // date-fns v4: getDaysInMonth(date)
                                            // We need to import getDaysInMonth, startOfMonth, endOfMonth at top if not present
                                            // Assuming they are imported or available via date-fns
                                            const daysInMonth = new Date(safeMonthDate.getFullYear(), safeMonthDate.getMonth() + 1, 0).getDate();

                                            const monthStartStr = format(safeMonthDate, 'yyyy-MM-01');
                                            const monthEndStr = format(new Date(safeMonthDate.getFullYear(), safeMonthDate.getMonth() + 1, 0), 'yyyy-MM-dd');

                                            const empAttendance = attendance.filter(r =>
                                                r.employeeId === emp.id &&
                                                r.date >= monthStartStr &&
                                                r.date <= monthEndStr
                                            );

                                            // Calculate Absent Days (Excluding Sundays and Holidays)
                                            let calculatedAbsentDays = 0;
                                            const mStart = startOfMonth(safeMonthDate);
                                            const mEnd = endOfMonth(safeMonthDate);

                                            for (let d = new Date(mStart); d <= mEnd; d.setDate(d.getDate() + 1)) {
                                                const dayOfWeek = d.getDay(); // 0 is Sunday
                                                const dateStr = format(d, 'yyyy-MM-dd');
                                                const isHoliday = holidays.some(h => h.date === dateStr);

                                                if (dayOfWeek !== 0 && !isHoliday) {
                                                    const isPresent = attendance.some(r => r.employeeId === emp.id && r.date === dateStr);
                                                    if (!isPresent) {
                                                        calculatedAbsentDays++;
                                                    }
                                                }
                                            }

                                            const absentDays = calculatedAbsentDays;
                                            const presentDays = empAttendance.length;
                                            const lateDays = empAttendance.filter(r => r.isLate).length;

                                            const grossSalary = emp.baseSalary;
                                            const dailySalary = grossSalary / daysInMonth;
                                            const penaltyDays = lateDays > 2 ? lateDays - 2 : 0;
                                            const totalDeductionDays = penaltyDays + absentDays;
                                            const lateDeduction = totalDeductionDays * dailySalary;
                                            const netSalary = grossSalary - lateDeduction;

                                            return (
                                                <tr key={emp.id} className="bg-white border-b hover:bg-gray-50">
                                                    <td className="border p-3 font-medium text-gray-900">{emp.name}</td>
                                                    <td className="border p-3">{emp.role}</td>
                                                    <td className="border p-3 text-center">{daysInMonth}</td>
                                                    <td className="border p-3 text-center text-green-600 font-bold">{presentDays}</td>
                                                    <td className="border p-3 text-center text-red-600 font-bold">{absentDays}</td>
                                                    <td className="border p-3 text-center text-orange-600">{lateDays}</td>
                                                    <td className="border p-3 text-right">{formatCurrency(grossSalary)}</td>
                                                    <td className="border p-3 text-right text-red-600">{formatCurrency(lateDeduction)}</td>
                                                    <td className="border p-3 text-right font-bold text-blue-700">{formatCurrency(netSalary)}</td>
                                                </tr>
                                            );
                                        })}
                                        {employees.length === 0 && (
                                            <tr><td colSpan={9} className="p-8 text-center text-gray-400">No employees found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {/* 4. Leave Requests */}
                    {adminTab === 'LEAVES' && (
                        <section className="bg-white p-6 rounded-lg shadow mb-8 animate-fade-in">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><FileText size={20} /> Leave Requests</h3>
                            <div className="space-y-4">
                                {leaves.length === 0 && <p className="text-gray-400 italic">No leave requests found.</p>}
                                {leaves.map(leave => {
                                    const emp = employees.find(e => e.id === leave.employeeId);
                                    const isPending = leave.status === 'PENDING';
                                    return (
                                        <div key={leave.id} className={`flex justify-between items-center border p-4 rounded-lg ${isPending ? 'bg-yellow-50 border-yellow-100' : 'bg-gray-50'}`}>
                                            <div>
                                                <p className="font-bold text-gray-800">{emp?.name || 'Unknown'}</p>
                                                <p className="text-sm text-gray-600">{leave.startDate} to {leave.endDate}</p>
                                                <p className="text-sm text-gray-500 italic mt-1">"{leave.reason}"</p>
                                                {!isPending && <span className={`text-xs px-2 py-0.5 rounded mt-2 inline-block ${leave.status === 'APPROVED' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>{leave.status}</span>}
                                            </div>
                                            {isPending && (
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleLeaveAction(leave.id, 'APPROVED')} className="p-2 bg-green-100 text-green-700 hover:bg-green-200 rounded flex items-center gap-1"><CheckCircle size={16} /> Approve</button>
                                                    <button onClick={() => handleLeaveAction(leave.id, 'REJECTED')} className="p-2 bg-red-100 text-red-700 hover:bg-red-200 rounded flex items-center gap-1"><XCircle size={16} /> Reject</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* 5. Holidays */}
                    {adminTab === 'HOLIDAYS' && (
                        <section className="bg-white p-6 rounded-lg shadow mb-8 animate-fade-in">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Calendar size={20} /> Holidays</h3>
                            <div className="flex gap-4 mb-6">
                                <input type="date" id="holidayDate" className="border p-2 rounded" />
                                <input type="text" id="holidayName" placeholder="Holiday Name (e.g. Diwali)" className="border p-2 rounded flex-1" />
                                <button
                                    onClick={() => {
                                        const d = (document.getElementById('holidayDate') as HTMLInputElement).value;
                                        const n = (document.getElementById('holidayName') as HTMLInputElement).value;
                                        if (d && n) {
                                            addHoliday(d, n);
                                            (document.getElementById('holidayDate') as HTMLInputElement).value = '';
                                            (document.getElementById('holidayName') as HTMLInputElement).value = '';
                                        }
                                    }}
                                    className="bg-purple-600 text-white px-4 rounded hover:bg-purple-700"
                                >Add Holiday</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {holidays.map(h => (
                                    <div key={h.id} className="bg-purple-50 p-3 rounded flex justify-between items-center border border-purple-100">
                                        <div>
                                            <p className="font-bold text-purple-900">{h.name}</p>
                                            <p className="text-xs text-purple-700">{h.date}</p>
                                        </div>
                                        <button onClick={() => deleteHoliday(h.id)} className="text-gray-400 hover:text-red-500"><X size={16} /></button>
                                    </div>
                                ))}
                                {holidays.length === 0 && <p className="text-gray-400 col-span-3 text-center py-4">No holidays added.</p>}
                            </div>
                        </section>
                    )}

                    {/* 6. Settings */}
                    {adminTab === 'SETTINGS' && (
                        <section className="bg-white p-6 rounded-lg shadow mb-8 animate-fade-in">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><SettingsIcon size={20} /> Attendance Rules & Settings</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Login Time (Check-In)</label>
                                        <input type="time" value={settings.loginTime} onChange={(e) => updateSettings('loginTime', e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm border p-2" />
                                        <p className="text-xs text-gray-400 mt-1">Employees checking in more than 10 mins after this time will be marked late.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Logout Time (Check-Out)</label>
                                        <input type="time" value={settings.logoutTime} onChange={(e) => updateSettings('logoutTime', e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm border p-2" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Late Penalty Policy</label>
                                    <div className="mt-1 block w-full bg-red-50 border-red-100 border p-4 rounded-md">
                                        <h4 className="text-red-800 font-bold text-sm mb-2">Current Rule:</h4>
                                        <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
                                            <li><strong>Grace Period:</strong> First 2 late marks in a month are free.</li>
                                            <li><strong>Penalty:</strong> After 2 late marks, <strong>1 Day Salary</strong> is deducted for <em>every</em> subsequent late mark.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                </div>

                {/* Modals */}
                {showFaceScanner && <FaceScanner isScanning={showFaceScanner} onScan={handleFaceRegister} message={scanMessage} onClose={() => setShowFaceScanner(false)} />}
                {adminPayslipEmployee && (
                    <Payslip
                        employee={adminPayslipEmployee}
                        attendance={attendance.filter(a => a.employeeId === adminPayslipEmployee.id)}
                        month={new Date(selectedPayslipMonth)}
                        settings={settings}
                        holidays={holidays}
                        onClose={() => setAdminPayslipEmployee(null)}
                    />
                )}
            </div>
        );
    }

    // --- Employee Dashboard ---
    if (view === 'EMPLOYEE' && currentUser) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="max-w-5xl mx-auto">
                    <header className="flex justify-between items-center mb-8 bg-white p-6 rounded-xl shadow-sm">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Hello, {currentUser.name}</h1>
                            <p className="text-gray-500">{currentUser.role} • ID: {currentUser.id}</p>
                        </div>
                        <button onClick={() => setView('LOGIN')} className="text-red-500 border border-red-200 px-4 py-2 rounded hover:bg-red-50">Logout</button>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                            <h3 className="text-gray-500 text-sm font-bold uppercase mb-2">Attendance This Month</h3>
                            <p className="text-3xl font-bold text-blue-600">
                                {attendance.filter(a => a.employeeId === currentUser.id && new Date(a.date).getMonth() === new Date().getMonth()).length}
                                <span className="text-sm text-gray-400 font-normal ml-2">days</span>
                            </p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
                            <h3 className="text-gray-500 text-sm font-bold uppercase mb-2">Late Marks</h3>
                            <p className="text-3xl font-bold text-red-500">
                                {attendance.filter(a => a.employeeId === currentUser.id && a.isLate).length}
                            </p>
                            <p className="text-xs text-red-300 mt-1">Penalty: 1 Day Salary for each late mark after 2 free passes.</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500 flex items-center justify-between">
                            <div>
                                <h3 className="text-gray-500 text-sm font-bold uppercase mb-2">Current Salary</h3>
                                <p className="text-xl font-bold text-gray-800">{formatCurrency(currentUser.baseSalary)}</p>
                            </div>
                            <button
                                onClick={() => setShowPayslip(true)}
                                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 shadow-md flex items-center gap-2"
                            >
                                <DollarSign size={16} /> Payslip
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Leave Application */}
                        <div className="bg-white p-6 rounded-xl shadow-sm">
                            <h2 className="text-xl font-bold mb-6">Apply for Leave</h2>
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                const form = e.target as HTMLFormElement;
                                const start = (form.elements.namedItem('startDate') as HTMLInputElement).value;
                                const end = (form.elements.namedItem('endDate') as HTMLInputElement).value;
                                const reason = (form.elements.namedItem('reason') as HTMLInputElement).value;
                                applyLeave(start, end, reason);
                                form.reset();
                            }} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm text-gray-600">Start Date</label>
                                        <input name="startDate" type="date" required className="w-full border p-2 rounded mt-1" />
                                    </div>
                                    <div>
                                        <label className="text-sm text-gray-600">End Date</label>
                                        <input name="endDate" type="date" required className="w-full border p-2 rounded mt-1" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm text-gray-600">Reason</label>
                                    <textarea name="reason" required className="w-full border p-2 rounded mt-1 h-24" placeholder="Brief reason for leave..."></textarea>
                                </div>
                                <button type="submit" className="w-full bg-gray-800 text-white py-3 rounded font-semibold hover:bg-gray-900">
                                    Submit Request
                                </button>
                            </form>

                            <div className="mt-8">
                                <h3 className="font-bold mb-4 text-sm uppercase text-gray-500">Recent Requests</h3>
                                {leaves.filter(l => l.employeeId === currentUser.id).length === 0 && <p className="text-sm text-gray-400">No recent leave requests.</p>}
                                {leaves.filter(l => l.employeeId === currentUser.id).map(l => (
                                    <div key={l.id} className="flex justify-between text-sm border-b py-2">
                                        <span>{l.startDate}</span>
                                        <span className={`px-2 py-0.5 rounded text-xs ${l.status === 'APPROVED' ? 'bg-green-100 text-green-800' : l.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {l.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right Column: Attendance & Holidays */}
                        <div className="space-y-8">
                            {/* Recent Attendance */}
                            <div className="bg-white p-6 rounded-xl shadow-sm">
                                <h2 className="text-xl font-bold mb-6">Attendance History</h2>
                                <div className="overflow-auto max-h-[400px]">
                                    <table className="w-full text-left text-sm">
                                        <thead className="text-gray-500 border-b">
                                            <tr>
                                                <th className="pb-3">Date</th>
                                                <th className="pb-3">In</th>
                                                <th className="pb-3">Out</th>
                                                <th className="pb-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {attendance.filter(a => a.employeeId === currentUser.id).map(record => (
                                                <tr key={record.id}>
                                                    <td className="py-3">{record.date}</td>
                                                    <td className="py-3">{record.checkInTime ? format(new Date(record.checkInTime), 'HH:mm') : '-'}</td>
                                                    <td className="py-3">{record.checkOutTime ? format(new Date(record.checkOutTime), 'HH:mm') : '-'}</td>
                                                    <td className="py-3">
                                                        {record.isLate ? (
                                                            <span className="text-red-500 font-bold text-xs bg-red-50 px-2 py-1 rounded">LATE</span>
                                                        ) : (
                                                            <span className="text-green-500 font-bold text-xs bg-green-50 px-2 py-1 rounded">ON TIME</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {attendance.filter(a => a.employeeId === currentUser.id).length === 0 && (
                                                <tr><td colSpan={4} className="py-4 text-center text-gray-400">No attendance records found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Holidays List */}
                            <div className="bg-white p-6 rounded-xl shadow-sm">
                                <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Calendar className="text-purple-600" size={24} /> Upcoming Holidays</h2>
                                <div className="space-y-3">
                                    {holidays.length === 0 && <p className="text-gray-400 text-sm">No holidays announced yet.</p>}
                                    {holidays
                                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                        .map(h => (
                                            <div key={h.id} className="flex justify-between items-center p-3 bg-purple-50 rounded-lg border border-purple-100">
                                                <span className="font-semibold text-purple-900">{h.name}</span>
                                                <span className="text-sm text-purple-700 bg-white px-2 py-1 rounded shadow-sm">
                                                    {format(new Date(h.date), 'dd MMM yyyy')}
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {showPayslip && (
                    <Payslip
                        employee={currentUser}
                        attendance={attendance.filter(a => a.employeeId === currentUser.id)}
                        month={new Date()}
                        settings={settings}
                        holidays={holidays}
                        onClose={() => setShowPayslip(false)}
                    />
                )}
            </div>
        );
    }

    return <div>Loading...</div>;
};

export default App;
