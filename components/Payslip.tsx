import React from 'react';
import { Employee, AttendanceRecord, Settings, Holiday } from '../types';
import { formatCurrency } from '../constants';
import { differenceInMinutes, parse, format, getDaysInMonth, startOfMonth, endOfMonth, isSameDay } from 'date-fns';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface PayslipProps {
    employee: Employee;
    attendance: AttendanceRecord[];
    month: Date;
    settings: Settings;
    holidays: Holiday[];
    onClose: () => void;
}

export const Payslip: React.FC<PayslipProps> = ({ employee, attendance, month, settings, holidays, onClose }) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const totalDays = getDaysInMonth(month);

    // Filter attendance for this month
    const monthlyAttendance = attendance.filter(r => {
        const d = new Date(r.date);
        return d >= monthStart && d <= monthEnd;
    });

    const presentDays = monthlyAttendance.length;
    const lateDays = monthlyAttendance.filter(r => r.isLate).length;

    // Rule: After 2 late marks, deduction starts.
    // Then onwards on EACH late mark, 1 day salary is deducted.
    // Formula: If lateDays > 2, Penalty Days = lateDays - 2. Else 0.
    const grossSalary = employee.baseSalary;
    const dailySalary = grossSalary / totalDays;

    const penaltyDays = lateDays > 2 ? lateDays - 2 : 0;

    // Calculate Absent Days (Excluding Sundays and Holidays)
    let calculatedAbsentDays = 0;
    let workingDays = 0;

    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay(); // 0 is Sunday
        const dateStr = format(d, 'yyyy-MM-dd');
        const isHoliday = holidays.some(h => h.date === dateStr);

        if (dayOfWeek !== 0 && !isHoliday) {
            workingDays++;
            const isPresent = monthlyAttendance.some(r => r.date === dateStr);
            if (!isPresent) {
                calculatedAbsentDays++;
            }
        }
    }

    const absentDays = calculatedAbsentDays;
    const totalDeductionDays = penaltyDays + absentDays;

    // Daily salary should be based on total days in month or working days? 
    // Usually it's based on total days for monthly salaried employees, 
    // but deductions are based on "Loss of Pay".
    // If we stick to the previous logic: dailySalary = grossSalary / totalDays.
    // Let's keep it consistent with previous simple logic unless specified otherwise.
    // However, if we are excluding Sundays/Holidays from "Absent", we are essentially saying they are "Paid Leaves".

    const lateDeduction = totalDeductionDays * dailySalary;

    const netSalary = grossSalary - lateDeduction;

    const handlePrint = () => {
        window.print();
    };

    const handleDownload = async () => {
        const element = document.getElementById('payslip-content');
        if (!element) return;

        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                logging: false,
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgWidth = 210;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            pdf.save(`Payslip_${employee.name.replace(/\s+/g, '_')}_${format(month, 'MMM_yyyy')}.pdf`);
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Failed to generate PDF. Please try printing instead.");
        }
    };

    return (
        <div
            className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 overflow-auto p-4"
            onClick={onClose}
        >
            <div
                className="bg-white shadow-xl w-full max-w-2xl rounded-lg overflow-hidden relative"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Actions */}
                <div className="bg-gray-100 p-4 flex justify-between items-center border-b no-print">
                    <h2 className="text-lg font-bold text-gray-700">Payslip Preview</h2>
                    <div className="flex items-center gap-2">

                        <button onClick={handlePrint} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-medium flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                            Print
                        </button>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-200 transition-colors"
                            aria-label="Close"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>

                {/* Printable Area */}
                <div className="p-8 print-section" id="payslip-content">
                    <div className="text-center border-b pb-4 mb-6">
                        <h1 className="text-3xl font-bold uppercase tracking-wider text-gray-800">Nexa Finance and Insurance PVT LTD</h1>
                        <p className="text-gray-500">Office no.85, A wing 4th floor, KK Market, Pune Satara rd, Dhankawadi, pune- 411043</p>
                        <h2 className="text-xl font-semibold mt-4 text-blue-900">Payslip for {format(month, 'MMMM yyyy')}</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                        <div>
                            <p className="text-sm text-gray-500 uppercase">Employee Name</p>
                            <p className="font-bold text-lg">{employee.name}</p>
                            <p className="text-sm text-gray-500 uppercase mt-2">Designation</p>
                            <p className="font-medium">{employee.role}</p>
                            <p className="text-sm text-gray-500 uppercase mt-2">Employee ID</p>
                            <p className="font-medium">{employee.id}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-500 uppercase">Generated On</p>
                            <p className="font-medium">{format(new Date(), 'dd MMM yyyy')}</p>
                            <p className="text-sm text-gray-500 uppercase mt-2">Total Working Days</p>
                            <p className="font-medium">{totalDays}</p>
                            <p className="text-sm text-gray-500 uppercase mt-2">Days Present</p>
                            <p className="font-medium text-green-600">{presentDays}</p>
                            <p className="text-sm text-gray-500 uppercase mt-2">Days Absent</p>
                            <p className="font-medium text-red-600">{totalDays - presentDays}</p>
                        </div>
                    </div>

                    <table className="w-full mb-6 border-collapse">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="border p-2 text-left">Earnings</th>
                                <th className="border p-2 text-right">Amount</th>
                                <th className="border p-2 text-left">Deductions</th>
                                <th className="border p-2 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="border p-2">Basic Salary</td>
                                <td className="border p-2 text-right text-green-700">{formatCurrency(grossSalary)}</td>
                                <td className="border p-2">
                                    Late Penalty & Absences <br />
                                    <span className="text-xs text-gray-500">
                                        (Absent: {absentDays} days, Late Penalty: {penaltyDays} days)
                                    </span>
                                </td>
                                <td className="border p-2 text-right text-red-600">{formatCurrency(lateDeduction)}</td>
                            </tr>
                            <tr>
                                <td className="border p-2"></td>
                                <td className="border p-2 text-right"></td>
                                <td className="border p-2"></td>
                                <td className="border p-2 text-right"></td>
                            </tr>
                            <tr className="font-bold bg-gray-50">
                                <td className="border p-2">Total Earnings</td>
                                <td className="border p-2 text-right">{formatCurrency(grossSalary)}</td>
                                <td className="border p-2">Total Deductions</td>
                                <td className="border p-2 text-right">{formatCurrency(lateDeduction)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="flex justify-between items-center bg-blue-50 p-4 rounded border border-blue-100">
                        <span className="text-lg font-bold text-blue-900">Net Salary Payable</span>
                        <span className="text-2xl font-bold text-blue-900">{formatCurrency(netSalary)}</span>
                    </div>

                    <div className="mt-12 pt-4 border-t text-center text-xs text-gray-400">
                        <p>This is a computer-generated payslip and does not require a signature.</p>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-gray-50 p-4 border-t no-print flex justify-between items-center">
                    <button
                        onClick={onClose}
                        className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 font-medium flex items-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        Close
                    </button>
                    <button onClick={handleDownload} className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 font-medium flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Download PDF
                    </button>
                </div>
            </div>

            {/* Invisible print styles for specific layout control */}
            <style>{`
        @media print {
            body * {
                visibility: hidden;
            }
            .print-section, .print-section * {
                visibility: visible;
            }
            .print-section {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 20px;
                background: white;
            }
            .no-print {
                display: none;
            }
        }
      `}</style>
        </div>
    );
};