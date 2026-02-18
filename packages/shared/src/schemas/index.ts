import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('OK'),
  timestamp: z.string().datetime().optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Auth
export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).optional(),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export const updateProfileBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;

// Customers table
export const customersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  status: z.enum(['active', 'churned']).optional(),
  sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CustomersQuery = z.infer<typeof customersQuerySchema>;

// Customers CSV export – same filters, no pagination, capped limit
export const customersExportQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['active', 'churned']).optional(),
  sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(10000).default(5000),
});

export type CustomersExportQuery = z.infer<typeof customersExportQuerySchema>;

// Customer update (PATCH) – all optional
export const updateCustomerBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  status: z.enum(['active', 'churned']).optional(),
  segment: z.string().max(100).optional(),
});

export type UpdateCustomerBody = z.infer<typeof updateCustomerBodySchema>;

// Customer notes
export const noteBodySchema = z.object({
  content: z.string().min(1).max(1000),
});

export type NoteBody = z.infer<typeof noteBodySchema>;

// Admin – update user role
export const updateUserRoleSchema = z.object({
  role: z.enum(['admin', 'viewer']),
});

// Admin – create user
export const createUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(200).optional(),
  role: z.enum(['admin', 'viewer']).default('viewer'),
});

export const adminResetPasswordBodySchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export type UpdateUserRoleBody = z.infer<typeof updateUserRoleSchema>;
export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type AdminResetPasswordBody = z.infer<typeof adminResetPasswordBodySchema>;

// Admin – audit query
export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  userId: z.string().optional(),
  action: z.string().trim().optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

