/**
 * Client Service.
 *
 * Handles CRUD operations for clients (customer businesses).
 * Each client has a UUID that serves as the RLS tenant identifier in GEOFlow.
 */

import type { PrismaClient, Prisma } from '@prisma/client';

import { AppError } from '../utils/error.js';
import type {
  CreateClientInput,
  UpdateClientInput,
  ClientQuery,
  ClientResponse,
} from '../schemas/client.schema.js';

/**
 * Client service dependencies.
 */
export interface ClientServiceDeps {
  prisma: PrismaClient;
}

/**
 * Create the client service.
 *
 * @param deps - Service dependencies (Prisma client)
 * @returns Client service functions
 */
export function createClientService(deps: ClientServiceDeps) {
  const { prisma } = deps;

  /**
   * Create a new client.
   *
   * @param input - Client creation data
   * @returns Created client
   */
  async function create(input: CreateClientInput): Promise<ClientResponse> {
    const client = await prisma.client.create({
      data: {
        name: input.name,
        brandName: input.brandName ?? null,
        websiteUrl: input.websiteUrl || null,
        industry: input.industry ?? null,
      },
    });

    return toResponse(client);
  }

  /**
   * Get a paginated list of clients.
   *
   * @param query - Pagination and filter parameters
   * @returns Paginated client list
   */
  async function list(query: ClientQuery): Promise<{
    items: ClientResponse[];
    total: number;
  }> {
    const where: Prisma.ClientWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { brandName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.industry) {
      where.industry = { contains: query.industry, mode: 'insensitive' };
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.client.count({ where }),
    ]);

    return {
      items: clients.map(toResponse),
      total,
    };
  }

  /**
   * Get a single client by ID.
   *
   * @param id - Client UUID
   * @returns Client info
   * @throws {AppError} 404 if not found
   */
  async function getById(id: string): Promise<ClientResponse> {
    const client = await prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      throw new AppError(404, '客户不存在');
    }

    return toResponse(client);
  }

  /**
   * Update a client.
   *
   * @param id - Client UUID
   * @param input - Update data (all fields optional)
   * @returns Updated client
   * @throws {AppError} 404 if not found
   */
  async function update(id: string, input: UpdateClientInput): Promise<ClientResponse> {
    const data: Prisma.ClientUpdateInput = {};

    if (input.name !== undefined) {
      data.name = input.name;
    }

    if (input.brandName !== undefined) {
      data.brandName = input.brandName;
    }

    if (input.websiteUrl !== undefined) {
      data.websiteUrl = input.websiteUrl || null;
    }

    if (input.industry !== undefined) {
      data.industry = input.industry;
    }

    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
    }

    const client = await prisma.client.update({
      where: { id },
      data,
    });

    return toResponse(client);
  }

  /**
   * Soft-delete a client (set isActive = false).
   *
   * @param id - Client UUID
   * @throws {AppError} 404 if not found
   */
  async function deactivate(id: string): Promise<void> {
    await prisma.client.update({
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
 * Convert a Prisma Client model to the API response shape.
 */
function toResponse(client: {
  id: string;
  name: string;
  brandName: string | null;
  websiteUrl: string | null;
  industry: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ClientResponse {
  return {
    id: client.id,
    name: client.name,
    brandName: client.brandName,
    websiteUrl: client.websiteUrl,
    industry: client.industry,
    isActive: client.isActive,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}
