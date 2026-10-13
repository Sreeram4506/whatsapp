#!/usr/bin/env node
/**
 * Creates the MongoDB Atlas database used for ConstituencyOS and the indexes
 * needed for tenant-scoped reads. It is safe to run repeatedly.
 *
 * Usage:
 *   MONGODB_URI='mongodb+srv://…' MONGODB_DB=constituencyos npm run db:mongodb:init
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI?.trim().replace(/^['\"]|['\"]$/g, "");
const databaseName = process.env.MONGODB_DB?.trim() || "constituencyos";

if (!uri) {
  console.error("MONGODB_URI is required. Keep it in a local .env file or secret manager.");
  process.exitCode = 1;
} else {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  const collections = [
    ["tenants", [{ key: { slug: 1 }, options: { unique: true } }, { key: { whatsappPhoneNumberId: 1 }, options: { unique: true, sparse: true } }]],
    ["users", [{ key: { email: 1 }, options: { unique: true } }, { key: { tenantId: 1, role: 1 } }]],
    ["teams", [{ key: { tenantId: 1, name: 1 }, options: { unique: true } }]],
    ["categories", [{ key: { tenantId: 1, code: 1 }, options: { unique: true } }]],
    ["mandals", [{ key: { tenantId: 1, name: 1 }, options: { unique: true } }]],
    ["villages", [{ key: { tenantId: 1, mandalId: 1, name: 1 }, options: { unique: true } }, { key: { tenantId: 1 } }]],
    ["citizens", [{ key: { tenantId: 1, phone: 1 }, options: { unique: true } }, { key: { tenantId: 1, bsuid: 1 }, options: { unique: true, sparse: true } }]],
    ["consentRecords", [{ key: { tenantId: 1, citizenId: 1, createdAt: -1 } }]],
    ["grievances", [{ key: { tenantId: 1, ticketNumber: 1 }, options: { unique: true } }, { key: { tenantId: 1, status: 1, createdAt: -1 } }, { key: { tenantId: 1, citizenId: 1, createdAt: -1 } }, { key: { tenantId: 1, villageId: 1, createdAt: -1 } }]],
    ["grievanceUpdates", [{ key: { tenantId: 1, grievanceId: 1, createdAt: 1 } }]],
    ["attachments", [{ key: { tenantId: 1, grievanceId: 1, createdAt: -1 } }]],
    ["conversations", [{ key: { tenantId: 1, citizenPhone: 1, channel: 1 }, options: { unique: true } }]],
    ["messages", [{ key: { tenantId: 1, conversationId: 1, createdAt: 1 } }, { key: { externalId: 1 }, options: { unique: true, sparse: true } }]],
    ["webhookEvents", [{ key: { eventKey: 1 }, options: { unique: true } }, { key: { tenantId: 1, receivedAt: -1 } }]],
    ["appointments", [{ key: { tenantId: 1, citizenId: 1, requestedAt: -1 } }]],
    ["guidanceArticles", [{ key: { tenantId: 1, type: 1, status: 1, sortOrder: 1 } }]],
    ["auditLogs", [{ key: { tenantId: 1, createdAt: -1 } }, { key: { entityId: 1, createdAt: -1 } }]],
    ["ticketCounters", [{ key: { tenantId: 1, year: 1 }, options: { unique: true } }]],
  ];

  try {
    await client.connect();
    const db = client.db(databaseName);
    for (const [name, indexes] of collections) {
      const collection = db.collection(name);
      await collection.createIndex({ _id: 1 });
      await collection.createIndexes(indexes);
    }
    console.log(`MongoDB database '${databaseName}' is ready with ${collections.length} collections.`);
  } finally {
    await client.close();
  }
}
