import { GrievanceStatus, Priority, Role, Tenant } from "@prisma/client";

export const OPEN_STATUSES: GrievanceStatus[] = [
  "RECEIVED",
  "VERIFICATION",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_INFO",
  "REOPENED",
];
export const DONE_STATUSES: GrievanceStatus[] = ["RESOLVED", "CLOSED"];

/**
 * Workflow: Received → Verification → Assigned → In Progress → Awaiting Information → Resolved → Closed
 * (Reopen allowed from Resolved/Closed.)
 */
export const TRANSITIONS: Record<GrievanceStatus, GrievanceStatus[]> = {
  RECEIVED: ["VERIFICATION", "ASSIGNED", "AWAITING_INFO", "CLOSED"],
  VERIFICATION: ["ASSIGNED", "AWAITING_INFO", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "AWAITING_INFO", "VERIFICATION"],
  IN_PROGRESS: ["AWAITING_INFO", "RESOLVED", "ASSIGNED"],
  AWAITING_INFO: ["VERIFICATION", "ASSIGNED", "IN_PROGRESS", "CLOSED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["VERIFICATION", "ASSIGNED", "IN_PROGRESS"],
};

/** Which roles may move a case into a given status. Field officers cannot resolve or close. */
export const STATUS_ROLE: Record<GrievanceStatus, Role[]> = {
  RECEIVED: [],
  VERIFICATION: ["OFFICE_ADMIN"],
  ASSIGNED: ["OFFICE_ADMIN"],
  IN_PROGRESS: ["OFFICE_ADMIN", "FIELD_OFFICER"],
  AWAITING_INFO: ["OFFICE_ADMIN", "FIELD_OFFICER"],
  RESOLVED: ["OFFICE_ADMIN"],
  CLOSED: ["OFFICE_ADMIN"],
  REOPENED: ["OFFICE_ADMIN"],
};

export const STATUS_LABEL: Record<GrievanceStatus, { en: string; te: string }> = {
  RECEIVED: { en: "Received", te: "స్వీకరించబడింది" },
  VERIFICATION: { en: "Under verification", te: "పరిశీలనలో ఉంది" },
  ASSIGNED: { en: "Assigned to team", te: "బృందానికి అప్పగించబడింది" },
  IN_PROGRESS: { en: "Work in progress", te: "పని జరుగుతోంది" },
  AWAITING_INFO: { en: "Waiting for information from you", te: "మీ నుండి సమాచారం కోసం వేచి ఉంది" },
  RESOLVED: { en: "Resolved – please confirm", te: "పరిష్కరించబడింది – దయచేసి నిర్ధారించండి" },
  CLOSED: { en: "Closed", te: "ముగించబడింది" },
  REOPENED: { en: "Reopened", te: "మళ్లీ తెరవబడింది" },
};

export const PRIORITY_ORDER: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export interface TenantSettings {
  slaDays: Record<Priority, number>;
  escalationAfterOverdueHours: number;
  retentionMonths: number;
  mlaCanViewCitizenContact: boolean;
  privacyNoticeVersion: string;
}

export const DEFAULT_SETTINGS: TenantSettings = {
  slaDays: { CRITICAL: 2, HIGH: 5, MEDIUM: 10, LOW: 20 },
  escalationAfterOverdueHours: 48,
  retentionMonths: 24,
  mlaCanViewCitizenContact: false,
  privacyNoticeVersion: "2026-10-v1",
};

export function tenantSettings(t: Pick<Tenant, "settings">): TenantSettings {
  const s = (t.settings ?? {}) as Partial<TenantSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    slaDays: { ...DEFAULT_SETTINGS.slaDays, ...(s.slaDays ?? {}) },
  };
}
