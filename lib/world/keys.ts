/**
 * DynamoDB single-table layout for the live world read model. ONE place defines the keys so the
 * outbox projector (writer) and the world snapshot (reader) can never disagree.
 *
 * Partition is the realm. Three entity kinds share it:
 *   - ITEM_PROJECTION   sk = ITEM#<instanceId>     current owner/region/version of a unique item
 *                                                   (the legendary's single live location)
 *   - REALM_PROJECTION  sk = PROJECTION#REALM       cumulative counters (settled, gold moved, …)
 *   - EVENT             sk = EVENT#<createdAt>#<id>  the settlement feed (begins_with(sk,"EVENT#"))
 */

export const ENTITY = {
  ITEM: "ITEM_PROJECTION",
  REALM: "REALM_PROJECTION",
  EVENT: "EVENT",
} as const;

export const ddbKeys = {
  realmPk: (realmId: string) => `REALM#${realmId}`,
  itemSk: (instanceId: string) => `ITEM#${instanceId}`,
  realmProjectionSk: () => "PROJECTION#REALM",
  eventSk: (createdAt: string, eventId: string) => `EVENT#${createdAt}#${eventId}`,
  /** Prefix for querying the settlement feed newest-first. */
  eventPrefix: () => "EVENT#",
} as const;
