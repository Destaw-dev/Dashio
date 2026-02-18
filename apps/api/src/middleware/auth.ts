import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { User } from '../models/User';
import { JWT_SECRET } from '../config/auth';
import { hasPermission, resolvePermissions, type Permission } from '../config/permissions';

export interface AuthPayload {
  sub: string;
  role: string;
}

export interface RequestWithUser extends Request {
  user?: { id: string; email: string; name?: string; role: string; permissions: string[] };
}

export async function requireAuth(req: RequestWithUser, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.token;
  if (!token) {
    throw new AppError(401, 'Authentication required');
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    const user = await User.findById(decoded.sub).select('email name role permissions');
    if (!user) {
      throw new AppError(401, 'User not found');
    }
    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: resolvePermissions(user.role, user.permissions),
    };
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'Invalid or expired token');
    }
    throw err;
  }
}

export function requireAdmin(req: RequestWithUser, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new AppError(401, 'Authentication required');
  }
  if (req.user.role !== 'admin') {
    throw new AppError(403, 'Admin role required');
  }
  next();
}

export function requirePermission(permission: Permission) {
  return (req: RequestWithUser, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(401, 'Authentication required');
    }
    if (!hasPermission(req.user, permission)) {
      throw new AppError(403, `Missing permission: ${permission}`);
    }
    next();
  };
}
