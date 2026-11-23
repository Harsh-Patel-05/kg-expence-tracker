import type { AuditFields, SyncStatus } from "@/features/pos/types";

export type AttendanceStatus =
  | "present"
  | "half-day"
  | "absent"
  | "holiday"
  | "week_off"
  | "late"
  | "on_leave";

export type LeaveType =
  | "casual"
  | "sick"
  | "paid"
  | "unpaid"
  | "emergency"
  | "maternity"
  | "paternity"
  | "custom";

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type SalaryType = "monthly" | "daily" | "hourly";

export type TaskStatus =
  | "draft"
  | "assigned"
  | "accepted"
  | "todo"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "done"
  | "completed"
  | "cancelled"
  | "overdue";

export type TaskType =
  | "daily"
  | "kitchen"
  | "cleaning"
  | "inventory"
  | "purchase"
  | "maintenance"
  | "marketing"
  | "hr"
  | "finance"
  | "custom";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type ReminderCategory =
  | "vendor_payment"
  | "salary"
  | "rent"
  | "utility"
  | "inventory"
  | "compliance"
  | "maintenance"
  | "customer"
  | "checklist"
  | "birthday"
  | "custom";

export type RecurrenceFreq =
  | "once"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "custom";

/** Extends vanilla `staff` docs (`name` required for POS/attendance compat). */
export type EmployeeDoc = AuditFields & {
  name: string;
  employeeCode?: string;
  photoUrl?: string;
  gender?: string;
  dob?: string;
  joiningDate?: string;
  department?: string;
  designation?: string;
  role?: string;
  managerId?: string | null;
  managerName?: string | null;
  email?: string;
  phone?: string;
  whatsapp?: string;
  emergencyContact?: string;
  address?: string;
  branch?: string;
  salaryType?: SalaryType;
  monthlySalary?: number;
  dailyWage?: number;
  hourlyRate?: number;
  bankAccount?: string;
  ifsc?: string;
  upi?: string;
  pan?: string;
  aadhar?: string;
  documents?: string[];
  skills?: string[];
  notes?: string;
  active?: boolean;
  syncStatus?: SyncStatus;
};

export type FixedSalaryDoc = AuditFields & {
  name: string;
  amount: number;
  joinDate?: string;
  staffId?: string | null;
  syncStatus?: SyncStatus;
};

export type AttendanceDoc = AuditFields & {
  date: string;
  name: string;
  staffId?: string | null;
  status: AttendanceStatus;
  clockIn?: string | null;
  clockOut?: string | null;
  breakMinutes?: number;
  lateMinutes?: number;
  overtimeMinutes?: number;
  note?: string;
  geo?: { lat?: number; lng?: number };
  syncStatus?: SyncStatus;
};

export type LeaveRequestDoc = AuditFields & {
  staffId?: string | null;
  name: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason?: string;
  documents?: string[];
  approvalStatus: LeaveRequestStatus;
  managerComment?: string;
  approvedBy?: string | null;
  syncStatus?: SyncStatus;
};

export type SalaryDoc = AuditFields & {
  month: string;
  name: string;
  staffId?: string | null;
  amount: number;
  basic?: number;
  hra?: number;
  allowance?: number;
  bonus?: number;
  deduction?: number;
  pf?: number;
  esic?: number;
  ptax?: number;
  advanceAdjusted?: number;
  netSalary?: number;
  status: "paid" | "unpaid";
  paymentMethod?: "cash" | "online" | "bank" | "upi";
  paidAt?: string | null;
  syncStatus?: SyncStatus;
};

export type AdvanceDoc = AuditFields & {
  date: string;
  month: string;
  name: string;
  staffId?: string | null;
  amount: number;
  method?: "cash" | "online" | "bank" | "upi";
  note?: string;
  recovered?: number;
  syncStatus?: SyncStatus;
};

export type IncentiveDoc = AuditFields & {
  date: string;
  month: string;
  name: string;
  staffId?: string | null;
  type: "sales" | "performance" | "attendance" | "festival" | "custom";
  amount: number;
  note?: string;
  syncStatus?: SyncStatus;
};

export type TipDoc = AuditFields & {
  date: string;
  amount: number;
  mode: "cash" | "online" | "shared" | "individual";
  staffId?: string | null;
  name?: string;
  settled?: boolean;
  syncStatus?: SyncStatus;
};

export type ShiftDoc = AuditFields & {
  name: string;
  startTime: string;
  endTime: string;
  kind?: "morning" | "afternoon" | "night" | "split" | "custom";
  syncStatus?: SyncStatus;
};

export type ShiftAssignmentDoc = AuditFields & {
  date: string;
  shiftId: string;
  shiftName?: string;
  staffId?: string | null;
  name: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  swapRequested?: boolean;
  syncStatus?: SyncStatus;
};

export type PerformanceDoc = AuditFields & {
  month: string;
  name: string;
  staffId?: string | null;
  rating?: number;
  attendanceScore?: number;
  salesScore?: number;
  accuracyScore?: number;
  notes?: string;
  syncStatus?: SyncStatus;
};

export type ReminderDoc = AuditFields & {
  title: string;
  dueDate: string;
  dueTime?: string;
  notifyBeforeDays?: number;
  notifyBeforeMinutes?: number[];
  category?: ReminderCategory;
  priority?: TaskPriority;
  assignedTo?: string | null;
  assignedName?: string | null;
  channels?: Array<"in_app" | "push" | "email" | "whatsapp" | "sms">;
  recurrence?: RecurrenceFreq;
  recurrenceInterval?: number;
  recurrenceEndDate?: string | null;
  recurrenceCount?: number | null;
  completed?: boolean;
  done?: boolean;
  enabled?: boolean;
  snoozedUntil?: string | null;
  relatedEntityType?: string;
  relatedEntityId?: string;
  notes?: string;
  tags?: string[];
  syncStatus?: SyncStatus;
};

export type TaskDoc = AuditFields & {
  title: string;
  description?: string;
  taskNumber?: string;
  taskType?: TaskType;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assigneeIds?: string[];
  assigneeNames?: string[];
  assignedBy?: string | null;
  assignedByName?: string | null;
  team?: string;
  department?: string;
  branch?: string;
  category?: string;
  priority: TaskPriority;
  status: TaskStatus;
  labels?: string[];
  tags?: string[];
  startDate?: string | null;
  dueDate?: string | null;
  endDate?: string | null;
  estimatedHours?: number;
  actualHours?: number;
  completionPct?: number;
  checklist?: Array<{ id: string; text: string; done: boolean; parentId?: string | null }>;
  subtaskIds?: string[];
  parentTaskId?: string | null;
  dependencyIds?: string[];
  blockedByIds?: string[];
  waitingForIds?: string[];
  attachments?: Array<{ name: string; url: string; type?: string } | string>;
  comments?: Array<{ id: string; text: string; by?: string; at: string; parentId?: string | null }>;
  notes?: string;
  internalNotes?: string;
  recurrence?: RecurrenceFreq;
  recurrenceInterval?: number;
  archived?: boolean;
  completedAt?: string | null;
  syncStatus?: SyncStatus;
};

export type PayrollResult = {
  name: string;
  month: string;
  presentEquivalent: number;
  monthlyFixed: number;
  earned: number;
  advances: number;
  incentives: number;
  tips: number;
  deductions: number;
  net: number;
  absent: number;
  half: number;
};
