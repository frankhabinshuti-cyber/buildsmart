import { z } from 'zod';
import { isMoney, isQty } from '../utils/money.js';

const trimmed = (max, min = 1) => z.string().trim().min(min, 'Required').max(max, `Max ${max} characters`);
const optText = (max) => z.string().trim().max(max).optional().nullable().transform((v) => (v === undefined ? undefined : v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
const optDate = date.optional().nullable().or(z.literal('').transform(() => null));
const money = z.union([z.string(), z.number()]).transform(String).refine(isMoney, 'Enter a valid amount (max 2 decimals)');
const qty = z.union([z.string(), z.number()]).transform(String).refine(isQty, 'Enter a valid quantity (max 3 decimals)');
const id = z.coerce.number().int().positive();
const optId = z.coerce.number().int().positive().optional().nullable().or(z.literal('').transform(() => null));

export const SELF_REGISTER_ROLES = ['company', 'project_manager', 'client', 'engineer_architect', 'worker', 'supplier'];

export const password = z.string().min(8, 'At least 8 characters').max(72)
  .regex(/[a-z]/, 'Needs a lowercase letter').regex(/[A-Z]/, 'Needs an uppercase letter').regex(/\d/, 'Needs a number');

export const registerSchema = z.object({
  fullName: trimmed(120, 2),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(190),
  password,
  role: z.enum(SELF_REGISTER_ROLES, { errorMap: () => ({ message: 'Choose a valid account type' }) }),
  phone: optText(30),
  location: optText(120),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Required').max(72),
});
export const profileSchema = z.object({ fullName: trimmed(120, 2), phone: optText(30), location: optText(120) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetSchema = z.object({ token: z.string().min(20).max(200), newPassword: password });

const projectBase = z.object({
  title: trimmed(160, 3),
  description: optText(5000),
  location: optText(160),
  categoryId: optId,
  clientId: optId,
  managerId: optId,
  plannedStart: optDate,
  plannedEnd: optDate,
  estimatedBudget: money.default('0'),
  approvedBudget: money.optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
});
const datesOk = (d) => !d.plannedStart || !d.plannedEnd || d.plannedEnd >= d.plannedStart;
const datesMsg = { message: 'End date must be on or after the start date', path: ['plannedEnd'] };
export const projectSchema = projectBase.refine(datesOk, datesMsg);
export const projectUpdateSchema = projectBase.partial().refine(datesOk, datesMsg);
export const projectQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
  sort: z.enum(['created_at', 'title', 'planned_end', 'completion_pct']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  archived: z.enum(['true', 'false']).default('false'),
  page: z.coerce.number().optional(), limit: z.coerce.number().optional(),
});
export const memberSchema = z.object({ userId: id });
export const milestoneSchema = z.object({ title: trimmed(160), dueDate: optDate, status: z.enum(['pending', 'in_progress', 'done']).optional() });
export const progressSchema = z.object({ completionPct: z.coerce.number().int().min(0).max(100), note: optText(1000) });
export const messageSchema = z.object({ body: trimmed(2000) });

export const taskSchema = z.object({
  projectId: id,
  title: trimmed(160, 2),
  description: optText(3000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assigneeId: optId,
  startDate: optDate,
  dueDate: optDate,
  dependsOnTaskId: optId,
}).refine((d) => !d.startDate || !d.dueDate || d.dueDate >= d.startDate, { message: 'Due date must be on or after the start date', path: ['dueDate'] });
export const taskUpdateSchema = z.object({
  title: trimmed(160, 2).optional(),
  description: optText(3000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
  assigneeId: optId,
  startDate: optDate,
  dueDate: optDate,
  note: optText(500),
});
export const taskQuery = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
  mine: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().optional(), limit: z.coerce.number().optional(),
});

export const expenseSchema = z.object({
  category: z.enum(['labor', 'material', 'equipment', 'transport', 'other']),
  description: trimmed(300, 3),
  amount: money.refine((v) => Number(v) > 0, 'Amount must be greater than zero'),
  incurredOn: date,
});
export const expenseReviewSchema = z.object({ decision: z.enum(['approved', 'rejected']) });

export const supplierSchema = z.object({
  name: trimmed(150, 2), contactName: optText(120), phone: optText(30),
  email: z.string().trim().email().max(190).optional().nullable().or(z.literal('').transform(() => null)),
  location: optText(120),
});
export const materialSchema = z.object({
  name: trimmed(150, 2), category: optText(80), unit: trimmed(20), description: optText(500),
  supplierId: optId, unitCost: money.default('0'), reorderLevel: qty.default('0'),
  openingStock: qty.default('0'),
});
export const materialUpdateSchema = z.object({
  name: trimmed(150, 2).optional(), category: optText(80), unit: trimmed(20).optional(), description: optText(500),
  supplierId: optId, unitCost: money.optional(), reorderLevel: qty.optional(),
});
export const movementSchema = z.object({
  type: z.enum(['receipt', 'allocation', 'adjustment']),
  quantity: z.union([z.string(), z.number()]).transform(String).refine((v) => /^-?\d{1,11}(\.\d{1,3})?$/.test(v), 'Enter a valid quantity'),
  projectId: optId,
  unitCost: money.optional(),
  note: optText(500),
});

export const serviceSchema = z.object({
  categoryId: id, title: trimmed(150, 3), description: optText(3000), location: optText(120),
  priceFrom: money.optional().nullable().or(z.literal('').transform(() => null)),
  isPublished: z.boolean().optional(),
});
export const serviceQuery = z.object({
  q: z.string().trim().max(100).optional(), category: z.coerce.number().int().positive().optional(),
  location: z.string().trim().max(100).optional(),
  page: z.coerce.number().optional(), limit: z.coerce.number().optional(),
});
export const reviewSchema = z.object({ rating: z.coerce.number().int().min(1).max(5), comment: optText(1000) });
export const companySchema = z.object({
  name: trimmed(150, 2), description: optText(3000), location: optText(120), phone: optText(30),
  email: z.string().trim().email().max(190).optional().nullable().or(z.literal('').transform(() => null)),
  website: optText(190),
});

export const quotationRequestSchema = z.object({
  title: trimmed(160, 3), description: optText(5000), location: optText(160), categoryId: optId,
  budgetHint: money.optional().nullable().or(z.literal('').transform(() => null)),
});
const quoteItem = z.object({
  kind: z.enum(['material', 'labor', 'equipment', 'transport', 'other']),
  description: trimmed(300, 2), quantity: qty.refine((v) => Number(v) > 0, 'Must be greater than zero'), unitPrice: money,
});
export const quotationSchema = z.object({
  validUntil: date.refine((v) => v >= new Date().toISOString().slice(0, 10), 'Must be today or later'),
  notes: optText(1000),
  items: z.array(quoteItem).min(1, 'Add at least one item').max(100),
});

export const adminUserUpdate = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['super_admin', ...SELF_REGISTER_ROLES]).optional(),
});
export const adminUserQuery = z.object({
  q: z.string().trim().max(100).optional(), role: z.string().max(30).optional(),
  page: z.coerce.number().optional(), limit: z.coerce.number().optional(),
});
