import * as XLSX from 'xlsx';
import {
  IMPORT_DEFAULT_PASSWORD,
  IMPORT_MAX_MEMBERS,
  IMPORT_MAX_PLANS,
  IMPORT_MAX_TRAINERS,
  SAMPLE_MEMBERS,
  SAMPLE_PLANS,
  SAMPLE_TRAINERS,
} from './import.constants';

export interface TemplateFile {
  buffer: Buffer;
  filename: string;
  mime: string;
}

const INSTRUCTIONS = [
  {
    topic: 'What this is',
    detail:
      'Migrate trainers, members and membership plans from another gym platform into Fitzenix. Your old software is not changed — Fitzenix only creates new records.',
  },
  {
    topic: 'How to use',
    detail:
      'Fill the Plans, Trainers and Members sheets (or this CSV). Keep the header row. Delete the sample rows before uploading real data. Then upload the file from Owner app → Import Members.',
  },
  {
    topic: 'Existing Fitzenix data',
    detail:
      'Emails already in Fitzenix are skipped. Plans with the same name in this gym are reused (not overwritten). Nothing already in Fitzenix is edited or deleted.',
  },
  {
    topic: 'Limits',
    detail: `Up to ${IMPORT_MAX_PLANS} plans, ${IMPORT_MAX_TRAINERS} trainers and ${IMPORT_MAX_MEMBERS} members per file. Max file size 8 MB.`,
  },
  {
    topic: 'Passwords',
    detail: `Leave password blank to use ${IMPORT_DEFAULT_PASSWORD}. Share that with staff so they can sign in and change it.`,
  },
  {
    topic: 'Plans sheet',
    detail:
      'name (required), duration_days (e.g. 30), price_rupees (e.g. 1999), description, trainer_included (true/false), features (pipe-separated: Gym access | Cardio).',
  },
  {
    topic: 'Trainers sheet',
    detail: 'name, email (required, unique), phone, password (optional), specialties (pipe-separated).',
  },
  {
    topic: 'Members sheet',
    detail:
      'name, email (required, unique), phone, password (optional), plan_name (must match Plans sheet or an existing gym plan), trainer_email (optional), start_date (YYYY-MM-DD, blank = today), mark_paid (true/false, default true), allow_two_sessions (true/false).',
  },
  {
    topic: 'CSV files',
    detail:
      'Use a type column: plan | trainer | member. Put plan fields on plan rows, trainer fields on trainer rows, member fields on member rows.',
  },
];

export function buildXlsxTemplate(): TemplateFile {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(INSTRUCTIONS), 'Instructions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(SAMPLE_PLANS), 'Plans');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(SAMPLE_TRAINERS), 'Trainers');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(SAMPLE_MEMBERS), 'Members');
  const raw = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
  return {
    buffer,
    filename: 'fitzenix-import-template.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

const CSV_HEADERS = [
  'type',
  'name',
  'email',
  'phone',
  'password',
  'duration_days',
  'price_rupees',
  'description',
  'trainer_included',
  'features',
  'specialties',
  'plan_name',
  'trainer_email',
  'start_date',
  'mark_paid',
  'allow_two_sessions',
] as const;

export function buildCsvTemplate(): TemplateFile {
  const rows: Record<string, string>[] = [];
  for (const plan of SAMPLE_PLANS) {
    rows.push({ type: 'plan', ...plan });
  }
  for (const trainer of SAMPLE_TRAINERS) {
    rows.push({ type: 'trainer', ...trainer });
  }
  for (const member of SAMPLE_MEMBERS) {
    rows.push({ type: 'member', ...member });
  }
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...CSV_HEADERS] });
  const csv = XLSX.utils.sheet_to_csv(ws);
  return {
    buffer: Buffer.from(csv, 'utf8'),
    filename: 'fitzenix-import-template.csv',
    mime: 'text/csv; charset=utf-8',
  };
}

export function buildTemplate(kind: 'xlsx' | 'csv'): TemplateFile {
  return kind === 'csv' ? buildCsvTemplate() : buildXlsxTemplate();
}
