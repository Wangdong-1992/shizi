/**
 * Unified API Response Utilities.
 *
 * All API responses follow the format: { code, data, message }
 * Paginated responses use: { code, data: { items, total, page, pageSize }, message }
 */

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T = unknown> {
  /** HTTP status code: 200 | 400 | 401 | 403 | 404 | 500 */
  code: number;
  /** Response payload (null on error) */
  data: T | null;
  /** Human-readable message */
  message: string;
}

/**
 * Paginated data payload.
 */
export interface PaginatedData<T> {
  /** Array of items for the current page */
  items: T[];
  /** Total number of items across all pages */
  total: number;
  /** Current page number (1-based) */
  page: number;
  /** Items per page */
  pageSize: number;
}

/**
 * Create a success response.
 *
 * @param data - The response payload
 * @param message - Optional success message (default: "success")
 * @returns ApiResponse with code 200
 */
export function successResponse<T>(data: T, message: string = 'success'): ApiResponse<T> {
  return {
    code: 200,
    data,
    message,
  };
}

/**
 * Create a paginated success response.
 *
 * @param items - Array of items for the current page
 * @param total - Total item count
 * @param page - Current page number (1-based)
 * @param pageSize - Items per page
 * @returns ApiResponse with paginated data
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): ApiResponse<PaginatedData<T>> {
  return {
    code: 200,
    data: {
      items,
      total,
      page,
      pageSize,
    },
    message: 'success',
  };
}

/**
 * Create an error response.
 *
 * @param code - HTTP status code
 * @param message - Error message
 * @returns ApiResponse with null data
 */
export function errorResponse(code: number, message: string): ApiResponse<null> {
  return {
    code,
    data: null,
    message,
  };
}

/**
 * Create an error response with additional details.
 *
 * @param code - HTTP status code
 * @param message - Error message
 * @param details - Additional error details (e.g., validation field errors)
 * @returns ApiResponse with error details in data
 */
export function errorResponseWithDetails(
  code: number,
  message: string,
  details: unknown,
): ApiResponse<unknown> {
  return {
    code,
    data: details,
    message,
  };
}
