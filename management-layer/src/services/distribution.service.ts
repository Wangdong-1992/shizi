/**
 * Distribution Service.
 *
 * Encapsulates cross-layer calls to GEOFlow's distribution orchestrator.
 * Uses JWT authentication bridge (Phase 1 pattern) to call GEOFlow's
 * MgmtDistributionController endpoints through Nginx.
 */

import { env } from '../config/env.js';
import { AppError } from '../utils/error.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DistributionChannel {
  id: string;
  name: string;
  domain: string | null;
  channel_type: string;
  front_mode: string;
  tier: number;
  tier_label: string;
  mode: 'auto' | 'half-auto';
  mode_label: string;
  status: string;
  site_name: string;
  health: string;
}

export interface EnqueueResult {
  article_id: string;
  results: Array<{
    channel_id: string;
    channel_name: string;
    distribution_id: string | null;
    status: string;
    error?: string;
  }>;
}

export interface DistributionStatus {
  id: string;
  article_id: string;
  channel: { id: string; name: string; type: string; front_mode: string };
  status: string;
  attempts: number;
  error: string | null;
  logs: Array<{ level: string; message: string; created_at: string }>;
}

export interface AgentPackage {
  channel: string;
  site_name: string;
  article_count: number;
  articles: Array<{ id: string; title: string; content: string }>;
  template_key: string | null;
  download_url: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createDistributionService() {
  /**
   * Call GEOFlow's MgmtDistributionController via JWT-authenticated HTTP.
   */
  async function callMgmtEndpoint<T = unknown>(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
    clientId?: string,
  ): Promise<T> {
    const geoflowUrl = env.GEOFLOW_API_URL;
    const url = `${geoflowUrl}/mgmt/distribution${path}`;

    // Sign JWT for GEOFlow bridge (Phase 1 pattern)
    const jwtModule = await import('jsonwebtoken');
    const token = jwtModule.default.sign(
      { sub: 'system', role: 'ADMIN', client_id: clientId ?? '00000000-0000-0000-0000-000000000000' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '5m', issuer: 'geo-management' },
    );

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new AppError(response.status, `GEOFlow distribution API error: ${errBody}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Enqueue an article for distribution to specified channels.
   */
  async function enqueueArticle(
    articleId: string,
    channelIds: string[],
    clientId: string,
  ): Promise<EnqueueResult> {
    return callMgmtEndpoint<EnqueueResult>(
      '/enqueue',
      'POST',
      { article_id: articleId, channel_ids: channelIds },
      clientId,
    );
  }

  /**
   * Get distribution status for a distribution record.
   */
  async function getStatus(distributionId: string, clientId: string): Promise<DistributionStatus> {
    return callMgmtEndpoint<DistributionStatus>(
      `/status/${distributionId}`,
      'GET',
      undefined,
      clientId,
    );
  }

  /**
   * List available distribution channels for the client.
   */
  async function getChannels(clientId: string): Promise<DistributionChannel[]> {
    const result = await callMgmtEndpoint<{ data: DistributionChannel[] }>(
      '/channels',
      'GET',
      undefined,
      clientId,
    );
    return result.data ?? [];
  }

  /**
   * Generate an agent site package for a channel.
   */
  async function generateAgentPackage(
    channelId: string,
    clientId: string,
  ): Promise<AgentPackage> {
    return callMgmtEndpoint<AgentPackage>(
      `/package/${channelId}`,
      'GET',
      undefined,
      clientId,
    );
  }

  return {
    enqueueArticle,
    getStatus,
    getChannels,
    generateAgentPackage,
  };
}
