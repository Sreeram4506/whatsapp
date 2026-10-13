export type Role = "PLATFORM_ADMIN" | "OFFICE_ADMIN" | "MLA" | "FIELD_OFFICER";

export interface Me {
  user: { id: string; name: string; email: string; role: Role; team: { id: string; name: string } | null };
  tenant: null | {
    id: string;
    slug: string;
    officeName: string;
    mlaName: string;
    mlaDesignation: string;
    constituency: string;
    district: string;
    isSampleBranding: boolean;
    isDemoData: boolean;
    brandColor: string;
    ticketPrefix: string;
    settings: { mlaCanViewCitizenContact: boolean; retentionMonths: number; slaDays: Record<string, number>; escalationAfterOverdueHours: number };
  };
}

export interface PublicTenant {
  slug: string;
  officeName: string;
  mlaName: string;
  mlaDesignation: string;
  constituency: string;
  district: string;
  state: string;
  isSampleBranding: boolean;
  isDemoData: boolean;
  ticketPrefix: string;
  officeAddress: string | null;
  officeHours: string | null;
  officePhone: string | null;
  whatsappDisplayNumber: string | null;
  whatsappLive: boolean;
  privacyNoticeVersion: string;
  retentionMonths: number;
}

export interface SystemStatus {
  simulatorEnabled: boolean;
  ai: { provider: string; label: string; live: boolean };
  speechToText: boolean;
  whatsappWebhookConfigured: boolean;
  graphApiVersion: string;
}

export interface Meta {
  categories: { id: string; code: string; nameEn: string; nameTe: string; emoji: string; active: boolean; defaultPriority: string; isInfrastructure: boolean; defaultTeamId: string | null; defaultTeam: { id: string; name: string } | null }[];
  teams: { id: string; name: string; department: string; active: boolean }[];
  mandals: { id: string; name: string; nameTe: string | null; villages: { id: string; name: string; nameTe: string | null; kind: string }[] }[];
  officers: { id: string; name: string; teamId: string | null }[];
}

export interface GrievanceListItem {
  id: string;
  ticketNumber: string;
  status: string;
  priority: string;
  urgency: string;
  source: string;
  category: { nameEn: string; nameTe: string; emoji: string; code: string };
  village: string | null;
  mandal: string;
  team: string | null;
  assignee: string | null;
  citizenName: string | null;
  citizenPhone: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  overdue: boolean;
  escalationLevel: number;
  attachments: number;
  resolutionRequested: boolean;
  possibleDuplicate: boolean;
}

export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}
