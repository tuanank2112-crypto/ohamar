// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * contact-sub-resource-routes.ts — Sub-resource endpoints for contacts.
 * Provides appointments scoped to a specific contact.
 * All routes require JWT auth and are scoped to the user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { assertContactVisible } from './contact-scope.js';

function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

export async function contactSubResourceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/contacts/:id/profile — aggregate contact profile ──────────
  app.get('/api/v1/contacts/:id/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const visible = await assertContactVisible({
        userId: user.id,
        orgId: user.orgId,
        legacyRole: user.role,
        contactId: id,
      });
      if (!visible) return reply.status(404).send({ error: 'Contact not found' });

      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId, mergedInto: null },
        select: {
          id: true,
          fullName: true,
          crmName: true,
          email: true,
          addressLine: true,
          occupation: true,
          phone: true,
          phone2: true,
          phone3: true,
          gender: true,
          birthDate: true,
          birthYear: true,
          province: true,
          district: true,
          ward: true,
          leadScore: true,
          statusId: true,
          avatarUrl: true,
          tags: true,
          assignedUser: { select: { id: true, fullName: true } },
          statusRef: { select: { name: true } },
          friends: {
            select: {
              id: true,
              zaloUidInNick: true,
              zaloAccountId: true,
              zaloDisplayName: true,
              zaloAvatarUrl: true,
              aliasInNick: true,
              relationshipKind: true,
              totalInbound: true,
              totalOutbound: true,
              lastInboundAt: true,
              leadScore: true,
              crmTagsPerNick: true,
              statusRef: { select: { name: true } },
              zaloAccount: {
                select: {
                  id: true,
                  displayName: true,
                  owner: { select: { id: true, fullName: true } },
                },
              },
            },
            orderBy: [{ leadScore: 'desc' }, { lastInboundAt: { sort: 'desc', nulls: 'last' } }],
          },
        },
      });

      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const aggregateScore = contact.friends.reduce((max, friend) => Math.max(max, friend.leadScore), contact.leadScore);
      const displayName =
        contact.crmName ||
        contact.fullName ||
        contact.friends.find((friend) => friend.zaloDisplayName)?.zaloDisplayName ||
        contact.friends.find((friend) => friend.aliasInNick)?.aliasInNick ||
        '';
      const avatarUrl = contact.avatarUrl || contact.friends.find((friend) => friend.zaloAvatarUrl)?.zaloAvatarUrl || null;
      const aggregateTags = uniqueStrings([
        ...jsonStringArray(contact.tags),
        ...contact.friends.flatMap((friend) => jsonStringArray(friend.crmTagsPerNick)),
      ]);

      const recentSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const primaryFriend = [...contact.friends]
        .filter((friend) => friend.lastInboundAt && friend.lastInboundAt >= recentSince)
        .sort((a, b) => {
          const scoreDelta = b.leadScore - a.leadScore;
          if (scoreDelta !== 0) return scoreDelta;
          return (b.lastInboundAt?.getTime() ?? 0) - (a.lastInboundAt?.getTime() ?? 0);
        })[0];
      const owner = primaryFriend?.zaloAccount.owner ?? contact.assignedUser ?? null;

      return {
        contact: {
          id: contact.id,
          displayName,
          fullName: contact.fullName,
          crmName: contact.crmName,
          email: contact.email,
          addressLine: contact.addressLine,
          occupation: contact.occupation,
          phone: contact.phone,
          phone2: contact.phone2,
          phone3: contact.phone3,
          gender: contact.gender,
          birthDate: contact.birthDate,
          birthYear: contact.birthYear,
          province: contact.province,
          district: contact.district,
          ward: contact.ward,
          leadScore: contact.leadScore,
          statusId: contact.statusId,
          statusName: contact.statusRef?.name ?? null,
          avatarUrl,
        },
        friends: contact.friends.map((friend) => ({
          id: friend.id,
          zaloUid: friend.zaloUidInNick,
          accountId: friend.zaloAccountId,
          accountName: friend.zaloAccount.displayName,
          displayName: friend.zaloDisplayName,
          aliasInNick: friend.aliasInNick,
          leadScore: friend.leadScore,
          statusName: friend.statusRef?.name ?? null,
          relationshipKind: friend.relationshipKind,
          totalInbound: friend.totalInbound,
          totalOutbound: friend.totalOutbound,
          lastInboundAt: friend.lastInboundAt,
        })),
        aggregateScore,
        aggregateTags,
        primaryOwner: owner ? { userId: owner.id, userName: owner.fullName } : null,
      };
    } catch (err) {
      logger.error('[contacts] Contact profile error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact profile' });
    }
  });

  // ── GET /api/v1/contacts/:id/appointments — appointments for contact ───────
  app.get('/api/v1/contacts/:id/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const appointments = await prisma.appointment.findMany({
        where: { contactId: id, orgId: user.orgId },
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          statusChangedBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { appointmentDate: 'desc' },
        take: 20,
      });

      return { appointments };
    } catch (err) {
      logger.error('[contacts] Appointments by contact error:', err);
      return reply.status(500).send({ error: 'Failed to fetch appointments' });
    }
  });

  // ── GET /api/v1/contacts/by-zalo-uid/:uid — lookup CRM contact by Zalo UID
  // Trả contact info + assigned user + count conversations để dùng cho user dialog
  app.get('/api/v1/contacts/by-zalo-uid/:uid', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { uid } = request.params as { uid: string };

      const contact = await prisma.contact.findFirst({
        where: { zaloUid: uid, orgId: user.orgId, mergedInto: null },
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          _count: { select: { conversations: true, appointments: true } },
        },
      });

      if (!contact) return reply.send({ contact: null });

      // Last conversation for "Nhắn tin" deep-link
      const lastConv = await prisma.conversation.findFirst({
        where: { contactId: contact.id, orgId: user.orgId, deletedAt: null },
        orderBy: { lastMessageAt: 'desc' },
        select: { id: true, zaloAccountId: true },
      });

      return {
        contact: {
          id: contact.id,
          fullName: contact.fullName,
          crmName: contact.crmName,
          phone: contact.phone,
          email: contact.email,
          source: contact.source,
          status: contact.status,
          notes: contact.notes,
          tags: contact.tags,
          leadScore: contact.leadScore,
          firstContactDate: contact.firstContactDate,
          lastActivity: contact.lastActivity,
          assignedUser: contact.assignedUser,
          conversationsCount: contact._count.conversations,
          appointmentsCount: contact._count.appointments,
          lastConversationId: lastConv?.id ?? null,
        },
      };
    } catch (err) {
      logger.error('[contacts] By zalo uid error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact' });
    }
  });
}
