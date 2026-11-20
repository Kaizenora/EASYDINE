import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards the prepared (not auto-applied) Supabase RLS lockdown SQL.
const DIR = join(__dirname, '../../prisma/manual/2026-11-13-supabase-rls');
const sql = readFileSync(join(DIR, '02-lockdown.sql'), 'utf8');
const code = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

function prismaTables(): string[] {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const out = new Set<string>(['_prisma_migrations']);
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const map = /@@map\("([^"]+)"\)/.exec(m[2]);
    out.add(map ? map[1] : m[1]);
  }
  return [...out].sort();
}

describe('Supabase RLS lockdown SQL (prepared for approval)', () => {
  it('lists exactly the EasyDine tables (every Prisma model + _prisma_migrations)', () => {
    const block = /easydine_tables text\[\] := ARRAY\[([\s\S]*?)\];/.exec(code);
    expect(block).not.toBeNull();
    const listed = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(listed).toEqual(prismaTables());
  });

  it('only closes access: enables RLS and revokes; never disables, forces, opens or adds policies', () => {
    expect(code).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(code).toMatch(/REVOKE ALL ON TABLE public\.%I FROM anon, authenticated/);
    expect(code).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(code).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(code).not.toMatch(/CREATE POLICY/i);
    expect(code).not.toMatch(/\bGRANT\b(?![\s\S]*?REVOKE)/i);
    expect(code).not.toMatch(/service_role/i);
    expect(code).not.toMatch(/DROP\s/i);
  });

  it('runs as one transaction with a lock timeout', () => {
    expect(code.trim().startsWith('BEGIN;')).toBe(true);
    expect(code.trim().endsWith('COMMIT;')).toBe(true);
    expect(code).toMatch(/SET LOCAL lock_timeout/);
  });

  it('is not a Prisma migration (would auto-apply on deploy)', () => {
    expect(DIR).not.toMatch(/prisma[\\/]migrations/);
  });
});
