import * as XLSX from 'xlsx';
import { ApiError } from '../../utils/ApiError';
import {
  IMPORT_MAX_MEMBERS,
  IMPORT_MAX_PLANS,
  IMPORT_MAX_TRAINERS,
} from './import.constants';

export interface ParsedPlanRow {
  row: number;
  name: string;
  durationDays: number;
  pricePaise: number;
  description?: string;
  trainerIncluded: boolean;
  features: string[];
}

export interface ParsedTrainerRow {
  row: number;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  specialties: string[];
}

export interface ParsedMemberRow {
  row: number;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  planName?: string;
  trainerEmail?: string;
  startDate?: Date;
  markPaid: boolean;
  allowTwoSessions: boolean;
}


type RawRow = Record<string, string>;

function cell(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const ALIASES: Record<string, string> = {
  full_name: 'name',
  member_name: 'name',
  trainer_name: 'name',
  plan: 'plan_name',
  membership: 'plan_name',
  membership_plan: 'plan_name',
  email_id: 'email',
  mobile: 'phone',
  phone_number: 'phone',
  duration: 'duration_days',
  durationdays: 'duration_days',
  price: 'price_rupees',
  amount: 'price_rupees',
  amount_rupees: 'price_rupees',
  trainer: 'trainer_email',
  assigned_trainer: 'trainer_email',
  paid: 'mark_paid',
  already_paid: 'mark_paid',
  two_sessions: 'allow_two_sessions',
  allowtwosessions: 'allow_two_sessions',
  start: 'start_date',
  joining_date: 'start_date',
  feature: 'features',
  specialty: 'specialties',
  speciality: 'specialties',
  role: 'type',
  sheet: 'type',
};

function normalizeRow(raw: Record<string, unknown>): RawRow {
  const out: RawRow = {};
  for (const [key, value] of Object.entries(raw)) {
    let k = normalizeKey(key);
    k = ALIASES[k] ?? k;
    out[k] = cell(value);
  }
  return out;
}

function parseBool(value: string, fallback = false): boolean {
  if (!value) return fallback;
  return ['true', 'yes', 'y', '1'].includes(value.toLowerCase());
}

function parseList(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[|,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDate(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function parsePricePaise(value: string): number {
  const n = Number(String(value).replace(/[₹,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sheetToRows(sheet: XLSX.WorkSheet | undefined): RawRow[] {
  if (!sheet) return [];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  return json.map(normalizeRow).filter((row) => Object.values(row).some((v) => v.length > 0));
}

function findSheet(wb: XLSX.WorkBook, names: string[]): XLSX.WorkSheet | undefined {
  const wanted = names.map((n) => n.toLowerCase());
  const hit = wb.SheetNames.find((name) => wanted.includes(name.toLowerCase().trim()));
  return hit ? wb.Sheets[hit] : undefined;
}

export interface ParseIssue {
  sheet: string;
  row: number;
  message: string;
}

export interface ParsedImport {
  plans: ParsedPlanRow[];
  trainers: ParsedTrainerRow[];
  members: ParsedMemberRow[];
  errors: ParseIssue[];
}

function parsePlanRows(rows: RawRow[], sheetLabel: string, errors: ParseIssue[]): ParsedPlanRow[] {
  const out: ParsedPlanRow[] = [];
  rows.forEach((row, i) => {
    const name = row.name;
    if (!name) return;
    const durationDays = Number(row.duration_days || row.duration || 30);
    if (!Number.isFinite(durationDays) || durationDays < 1) {
      errors.push({ sheet: sheetLabel, row: i + 2, message: 'Invalid duration_days' });
      return;
    }
    out.push({
      row: i + 2,
      name,
      durationDays: Math.floor(durationDays),
      pricePaise: parsePricePaise(row.price_rupees || row.price || '0'),
      description: row.description || undefined,
      trainerIncluded: parseBool(row.trainer_included),
      features: parseList(row.features),
    });
  });
  if (out.length > IMPORT_MAX_PLANS) {
    throw ApiError.badRequest(`Too many plans (max ${IMPORT_MAX_PLANS})`);
  }
  return out;
}

function parseTrainerRows(rows: RawRow[], sheetLabel: string, errors: ParseIssue[]): ParsedTrainerRow[] {
  const out: ParsedTrainerRow[] = [];
  rows.forEach((row, i) => {
    const name = row.name;
    const email = (row.email || '').toLowerCase();
    if (!name && !email) return;
    if (!name || !isEmail(email)) {
      errors.push({ sheet: sheetLabel, row: i + 2, message: 'Trainer needs a name and a valid email' });
      return;
    }
    out.push({
      row: i + 2,
      name,
      email,
      phone: row.phone || undefined,
      password: row.password || undefined,
      specialties: parseList(row.specialties),
    });
  });
  if (out.length > IMPORT_MAX_TRAINERS) {
    throw ApiError.badRequest(`Too many trainers (max ${IMPORT_MAX_TRAINERS})`);
  }
  return out;
}

function parseMemberRows(rows: RawRow[], sheetLabel: string, errors: ParseIssue[]): ParsedMemberRow[] {
  const out: ParsedMemberRow[] = [];
  rows.forEach((row, i) => {
    const name = row.name;
    const email = (row.email || '').toLowerCase();
    if (!name && !email) return;
    if (!name || !isEmail(email)) {
      errors.push({ sheet: sheetLabel, row: i + 2, message: 'Member needs a name and a valid email' });
      return;
    }
    out.push({
      row: i + 2,
      name,
      email,
      phone: row.phone || undefined,
      password: row.password || undefined,
      planName: row.plan_name || undefined,
      trainerEmail: row.trainer_email ? row.trainer_email.toLowerCase() : undefined,
      startDate: parseDate(row.start_date),
      markPaid: parseBool(row.mark_paid, true),
      allowTwoSessions: parseBool(row.allow_two_sessions),
    });
  });
  if (out.length > IMPORT_MAX_MEMBERS) {
    throw ApiError.badRequest(`Too many members (max ${IMPORT_MAX_MEMBERS})`);
  }
  return out;
}

function parseTypedCsv(rows: RawRow[]): ParsedImport {
  const errors: ParseIssue[] = [];
  const plans: RawRow[] = [];
  const trainers: RawRow[] = [];
  const members: RawRow[] = [];
  for (const row of rows) {
    const type = (row.type || 'member').toLowerCase();
    if (type === 'plan') plans.push(row);
    else if (type === 'trainer') trainers.push(row);
    else members.push(row);
  }
  return {
    plans: parsePlanRows(plans, 'CSV plans', errors),
    trainers: parseTrainerRows(trainers, 'CSV trainers', errors),
    members: parseMemberRows(members, 'CSV members', errors),
    errors,
  };
}

export function parseImportFile(buffer: Buffer, filename: string): ParsedImport {
  const name = filename.toLowerCase();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw ApiError.badRequest('Could not read this file. Upload a valid .xlsx or .csv template.');
  }

  if (!wb.SheetNames.length) {
    throw ApiError.badRequest('The spreadsheet is empty.');
  }

  const errors: ParseIssue[] = [];

  if (name.endsWith('.csv') || wb.SheetNames.length === 1) {
    const rows = sheetToRows(wb.Sheets[wb.SheetNames[0]]);
    if (rows.some((row) => row.type)) {
      return parseTypedCsv(rows);
    }
    if (rows.some((row) => row.duration_days || row.price_rupees) && !rows.some((row) => row.email)) {
      return { plans: parsePlanRows(rows, 'Plans', errors), trainers: [], members: [], errors };
    }
    if (rows.some((row) => row.specialties) && !rows.some((row) => row.plan_name)) {
      return { plans: [], trainers: parseTrainerRows(rows, 'Trainers', errors), members: [], errors };
    }
    const memberSheet = findSheet(wb, ['Members', 'Member']);
    const memberRows = memberSheet
      ? sheetToRows(memberSheet)
      : findSheet(wb, ['Plans', 'Trainers', 'Plan', 'Trainer'])
        ? []
        : rows;
    return {
      plans: parsePlanRows(sheetToRows(findSheet(wb, ['Plans', 'Plan'])), 'Plans', errors),
      trainers: parseTrainerRows(sheetToRows(findSheet(wb, ['Trainers', 'Trainer'])), 'Trainers', errors),
      members: parseMemberRows(memberRows, 'Members', errors),
      errors,
    };
  }

  return {
    plans: parsePlanRows(sheetToRows(findSheet(wb, ['Plans', 'Plan'])), 'Plans', errors),
    trainers: parseTrainerRows(sheetToRows(findSheet(wb, ['Trainers', 'Trainer'])), 'Trainers', errors),
    members: parseMemberRows(sheetToRows(findSheet(wb, ['Members', 'Member'])), 'Members', errors),
    errors,
  };
}
