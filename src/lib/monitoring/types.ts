export const MONITOR_KINDS = ["FULL", "PRICE"] as const;
export type MonitorKind = (typeof MONITOR_KINDS)[number];

export const MONITOR_FREQUENCIES = ["DAILY", "WEEKLY"] as const;
export type MonitorFrequency = (typeof MONITOR_FREQUENCIES)[number];

export const MONITOR_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type MonitorStatus = (typeof MONITOR_STATUSES)[number];

export const MONITOR_EXECUTION_STATUSES = [
  "PENDING",
  "SKIPPED",
  "COMPLETED",
  "FAILED",
] as const;
export type MonitorExecutionStatus =
  (typeof MONITOR_EXECUTION_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_DELIVERY_STATUSES = [
  "PENDING",
  "DELIVERED",
  "FAILED",
] as const;
export type NotificationDeliveryStatus =
  (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export type CreateMonitorInput = {
  watchlistEntryId: string;
  kind: MonitorKind;
  frequency: MonitorFrequency;
  startsAt: Date;
  expiresAt: Date;
};

export type UpdateMonitorInput = Partial<
  Pick<
    CreateMonitorInput,
    "frequency" | "startsAt" | "expiresAt"
  >
> & {
  status?: MonitorStatus;
  lastEvaluatedAt?: Date | null;
  nextEvaluationAt?: Date | null;
};

export type RecordExecutionOnceInput = {
  monitorId: string;
  publicationKey: string;
  notificationIdempotencyKey: string;
};

export type WatchlistEntryRecord = {
  id: string;
  userId: string;
  ticker: string;
  lastDataAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ActiveMonitorRecord = {
  id: string;
  watchlistEntryId: string;
  kind: MonitorKind;
  frequency: MonitorFrequency;
  startsAt: Date;
  expiresAt: Date;
  status: MonitorStatus;
  lastEvaluatedAt?: Date | null;
  nextEvaluationAt?: Date | null;
};

export type MonitorExecutionRecord = {
  id: string;
  monitorId: string;
  publicationKey: string;
  status: MonitorExecutionStatus;
  creditReserved: boolean;
  creditCharged: boolean;
  notificationIdempotencyKey: string;
  skipReason?: string | null;
  errorReason?: string | null;
};

export type NotificationDeliveryRecord = {
  id: string;
  userId: string;
  executionId: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  providerMessageId?: string | null;
  errorReason?: string | null;
  attemptedAt?: Date | null;
  deliveredAt?: Date | null;
};

export type UpsertNotificationDeliveryInput = {
  userId: string;
  executionId: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  attemptedAt: Date;
  deliveredAt?: Date | null;
  providerMessageId?: string | null;
  errorReason?: string | null;
};

export type MonitoringTransactionClient = {
  watchlistEntry: {
    findMany: (args: unknown) => Promise<WatchlistEntryRecord[]>;
    upsert: (args: unknown) => Promise<WatchlistEntryRecord>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
  activeMonitor: {
    findMany: (args: unknown) => Promise<ActiveMonitorRecord[]>;
    findUnique: (args: unknown) => Promise<ActiveMonitorRecord | null>;
    create: (args: unknown) => Promise<ActiveMonitorRecord>;
    update: (args: unknown) => Promise<ActiveMonitorRecord>;
    delete: (args: unknown) => Promise<ActiveMonitorRecord>;
  };
  monitorExecution: {
    upsert: (args: unknown) => Promise<MonitorExecutionRecord>;
    update: (args: unknown) => Promise<MonitorExecutionRecord>;
  };
  notificationDelivery: {
    upsert: (args: unknown) => Promise<NotificationDeliveryRecord>;
  };
};

export type MonitoringPrismaClient = MonitoringTransactionClient & {
  $transaction: <T>(
    callback: (transaction: MonitoringTransactionClient) => Promise<T>,
  ) => Promise<T>;
};
