/**
 * Operator Service.
 *
 * Handles CRUD operations for platform operators (admin/staff users).
 * Password hashing is handled internally — never expose password hashes.
 */

import bcrypt from 'bcryptjs';
import type { PrismaClient, Prisma } from '@prisma/client';

import { env } from '../config/env.js';
import { AppError } from '../utils/error.js';
import type {
  CreateOperatorInput,
  UpdateOperatorInput,
  OperatorQuery,
  OperatorResponse,
} from '../schemas/operator.schema.js';

/**
 * Operator service dependencies.
 */
export interface OperatorServiceDeps {
  prisma: PrismaClient;
}

/**
 * Create the operator service.
 *
 * @param deps - Service dependencies (Prisma client)
 * @returns Operator service functions
 */
export function createOperatorService(deps: OperatorServiceDeps) {
  const { prisma } = deps;

  /**
   * Create a new operator.
   *
   * @param input - Operator creation data
   * @returns Created operator (without password hash)
   * @throws {AppError} 400 if email already exists (caught by Prisma P2002)
   */
  async function create(input: CreateOperatorInput): Promise<OperatorResponse> {
    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

    const operator = await prisma.operator.create({
      data: {
        email: input.email,
        password: passwordHash,
        name: input.name,
        role: input.role,
      },
    });

    return toResponse(operator);
  }

  /**
   * Get a paginated list of operators.
   *
   * @param query - Pagination and filter parameters
   * @returns Paginated operator list
   */
  async function list(query: OperatorQuery): Promise<{
    items: OperatorResponse[];
    total: number;
  }> {
    const where: Prisma.OperatorWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.role = query.role;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    const [operators, total] = await Promise.all([
      prisma.operator.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.operator.count({ where }),
    ]);

    return {
      items: operators.map(toResponse),
      total,
    };
  }

  /**
   * Get a single operator by ID.
   *
   * @param id - Operator UUID
   * @returns Operator info
   * @throws {AppError} 404 if not found
   */
  async function getById(id: string): Promise<OperatorResponse> {
    const operator = await prisma.operator.findUnique({
      where: { id },
    });

    if (!operator) {
      throw new AppError(404, '运营商不存在');
    }

    return toResponse(operator);
  }

  /**
   * Update an operator.
   *
   * @param id - Operator UUID
   * @param input - Update data (all fields optional)
   * @returns Updated operator
   * @throws {AppError} 404 if not found
   */
  async function update(id: string, input: UpdateOperatorInput): Promise<OperatorResponse> {
    const data: Prisma.OperatorUpdateInput = {};

    if (input.email !== undefined) {
      data.email = input.email;
    }

    if (input.password !== undefined) {
      data.password = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
    }

    if (input.name !== undefined) {
      data.name = input.name;
    }

    if (input.role !== undefined) {
      data.role = input.role;
    }

    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
    }

    const operator = await prisma.operator.update({
      where: { id },
      data,
    });

    return toResponse(operator);
  }

  /**
   * Soft-delete an operator (set isActive = false).
   *
   * @param id - Operator UUID
   * @throws {AppError} 404 if not found
   */
  async function deactivate(id: string): Promise<void> {
    await prisma.operator.update({
      where: { id },
      data: { isActive: false },
    });
  }

  return {
    create,
    list,
    getById,
    update,
    deactivate,
  };
}

/**
 * Convert a Prisma Operator model to the API response shape.
 * Strips the password hash.
 */
function toResponse(operator: {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): OperatorResponse {
  return {
    id: operator.id,
    email: operator.email,
    name: operator.name,
    role: operator.role,
    isActive: operator.isActive,
    createdAt: operator.createdAt.toISOString(),
    updatedAt: operator.updatedAt.toISOString(),
  };
}
