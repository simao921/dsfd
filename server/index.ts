import 'dotenv/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { transcribeAndTranslate, VoiceProcessingError } from './speech';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const ACCESS_COOKIE = 'obg_access';
const REFRESH_COOKIE = 'obg_refresh';
const STORAGE_BUCKET = 'obragoito-private-project-documents';
const profileSelect = 'id,role,username,full_name,enabled,password_change_required';

type PortalRole = 'admin' | 'client' | 'worker';
type PortalProfile = { id: string; role: PortalRole; username: string; full_name: string; enabled: boolean; password_change_required: boolean };
type PortalContext = { profile: PortalProfile; userClient: SupabaseClient; service: SupabaseClient; accessToken: string };

declare global {
  namespace Express {
    interface Request { portal?: PortalContext; }
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = 'HttpError'; this.status = status; }
}

function config() {
  return {
    url: process.env.SUPABASE_URL?.trim() ?? '',
    anon: process.env.SUPABASE_ANON_KEY?.trim() ?? '',
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
  };
}
function hasSupabaseConfig() {
  const current = config();
  return Boolean(current.url && current.anon && current.serviceRole);
}
function requireSupabaseConfig() {
  const current = config();
  if (!current.url || !current.anon || !current.serviceRole) {
    throw new HttpError(503, 'A ligação ao Supabase ainda não está configurada. Adicione SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY nas definições seguras do projeto.');
  }
  return current;
}
function createSupabase(key: string, accessToken?: string) {
  const current = requireSupabaseConfig();
  return createClient(current.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}
function createServiceClient() {
  const current = requireSupabaseConfig();
  return createSupabase(current.serviceRole);
}
function createAnonClient(accessToken?: string) {
  const current = requireSupabaseConfig();
  return createSupabase(current.anon, accessToken);
}

function isTrustedOrigin(origin: string) {
  const extras = [
    'https://gestaoobragoito.vercel.app',
    'https://obragoito.pt',
    ...(process.env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  ];
  if (extras.includes(origin)) return true;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  const host = url.hostname.toLowerCase();
  if ((host === 'localhost' || host === '127.0.0.1') && ['3000', '3001', '3002', '3003'].includes(url.port)) return true;
  if (url.protocol === 'https:' && (host === 'obragoito.pt' || host.endsWith('.obragoito.pt'))) return true;
  return false;
}
const corsOptions: cors.CorsOptions = {
  origin(origin, callback) { callback(null, Boolean(origin && isTrustedOrigin(origin))); },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Requested-With'],
  maxAge: 600,
};

// HTTPS Preview is embedded cross-site, so session cookies deliberately use SameSite=None; Secure.
// Plain HTTP local work is an explicit opt-in via COOKIE_SECURE=false, never inferred from req.secure.
function sessionCookieOptions(maxAge: number) {
  const secure = process.env.COOKIE_SECURE !== 'false';
  return { httpOnly: true, secure, sameSite: secure ? 'none' as const : 'lax' as const, path: '/', maxAge };
}
function setSessionCookies(res: Response, access: string, refresh: string) {
  res.cookie(ACCESS_COOKIE, access, sessionCookieOptions(55 * 60 * 1000));
  res.cookie(REFRESH_COOKIE, refresh, sessionCookieOptions(30 * 24 * 60 * 60 * 1000));
}
function clearSessionCookies(res: Response) {
  const secure = process.env.COOKIE_SECURE !== 'false';
  const options = { httpOnly: true, secure, sameSite: secure ? 'none' as const : 'lax' as const, path: '/' };
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

const identifierSchema = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(1024) });
const workerRowSchema = z.object({ full_name: z.string().trim().min(2).max(120), title: z.string().trim().max(80).optional() });
const importWorkersSchema = z.object({ workers: z.array(workerRowSchema).min(1).max(500) });
const clientSchema = z.object({ full_name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254) });
const titleSchema = z.object({ title: z.string().trim().min(2).max(80) });
const projectSchema = z.object({ name: z.string().trim().min(2).max(160), description: z.string().trim().max(5000).nullable().optional(), client_id: z.string().uuid().nullable().optional(), worker_ids: z.array(z.string().uuid()).max(100).default([]) });
const updateSchema = z.object({ title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(5000) });
const messageSchema = z.object({ project_id: z.string().uuid(), body: z.string().trim().min(2).max(5000) });
const documentSchema = z.object({ project_id: z.string().uuid(), audience: z.enum(['admin_only', 'workers', 'client']) });

function normalizeUsernameBase(value: string) {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return normalized.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 52) || 'utilizador';
}
function chooseUniqueUsername(fullName: string, taken: Set<string>) {
  const base = normalizeUsernameBase(fullName);
  let candidate = base.slice(0, 63);
  let suffix = 2;
  while (taken.has(candidate)) {
    const tail = `.${suffix++}`;
    candidate = `${base.slice(0, 63 - tail.length)}${tail}`;
  }
  taken.add(candidate);
  return candidate;
}
function randomPassword() { return randomBytes(32).toString('base64url'); }
function passwordFingerprint(password: string) { return createHash('sha256').update(password, 'utf8').digest('hex'); }
function safeFileName(value: string) {
  const base = path.basename(value).normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 140);
  return base || `documento-${randomUUID()}`;
}
function supabaseFailure(context: string, error: { code?: string; message?: string } | null | undefined): never {
  console.error(`[api] ${context}: ${error?.code ?? 'supabase_error'}`);
  throw new HttpError(500, `Não foi possível concluir a operação (${context}).`);
}
function checkSupabase<T extends { error: unknown }>(result: T, context: string) {
  if (result.error) supabaseFailure(context, result.error as { code?: string; message?: string });
  return result;
}

async function loadPortalContext(req: Request, res: Response): Promise<PortalContext | null> {
  const current = requireSupabaseConfig();
  const service = createSupabase(current.serviceRole);
  const anon = createSupabase(current.anon);
  let accessToken = String(req.cookies?.[ACCESS_COOKIE] ?? '');
  const refreshToken = String(req.cookies?.[REFRESH_COOKIE] ?? '');
  let authUser: { id: string } | null = null;
  if (accessToken) {
    const { data, error } = await anon.auth.getUser(accessToken);
    if (!error && data.user) authUser = data.user;
  }
  if (!authUser && refreshToken) {
    const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session && data.user) {
      accessToken = data.session.access_token;
      setSessionCookies(res, data.session.access_token, data.session.refresh_token);
      authUser = data.user;
    }
  }
  if (!authUser) { clearSessionCookies(res); return null; }
  const profileResult = await service.from('profiles').select(profileSelect).eq('id', authUser.id).maybeSingle();
  checkSupabase(profileResult, 'profile_lookup');
  const profile = profileResult.data as PortalProfile | null;
  if (!profile || !profile.enabled) { clearSessionCookies(res); return null; }
  return { profile, userClient: createSupabase(current.anon, accessToken), service, accessToken };
}
function requireAuth(roles: PortalRole[] = []): RequestHandler {
  return async (req, res, next) => {
    try {
      const context = await loadPortalContext(req, res);
      if (!context) { res.status(401).json({ error: 'Inicie sessão para continuar.' }); return; }
      if (context.profile.password_change_required && req.path !== '/api/auth/change-password') { res.status(403).json({ error: 'Altere a palavra-passe inicial para continuar.' }); return; }
      if (roles.length && !roles.includes(context.profile.role)) { res.status(403).json({ error: 'Esta conta não tem permissões para esta operação.' }); return; }
      req.portal = context;
      next();
    } catch (problem) { next(problem); }
  };
}
function requireRequestContext(req: Request): PortalContext {
  if (!req.portal) throw new HttpError(401, 'Inicie sessão para continuar.');
  return req.portal;
}
function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req, res).catch(next); };
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, frameguard: false, crossOriginEmbedderPolicy: false }));
app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') { next(); return; }
  const origin = req.get('origin');
  if (!origin || !isTrustedOrigin(origin)) { res.status(403).json({ error: 'Origem não autorizada.' }); return; }
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: '200kb' }));

const MAX_UPLOAD_BYTES = process.env.VERCEL ? 4 * 1024 * 1024 : 15 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(_req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowed = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt']);
    if (!allowed.has(extension)) { callback(new HttpError(415, 'Formato não permitido. Use PDF, imagem, documento Office, CSV ou TXT.')); return; }
    callback(null, true);
  },
});
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(_req, file, callback) {
    const mimeType = file.mimetype.toLowerCase().split(';')[0];
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedMimeTypes = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/aac']);
    const allowedExtensions = new Set(['.webm', '.ogg', '.mp4', '.m4a', '.mp3', '.wav', '.flac', '.aac']);
    if (!allowedMimeTypes.has(mimeType) || !allowedExtensions.has(extension)) { callback(new HttpError(415, 'Formato de áudio não suportado. Grave novamente no browser ou escreva a mensagem.')); return; }
    callback(null, true);
  },
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', supabaseConfigured: hasSupabaseConfig() }));

app.post('/api/speech/transcribe', requireAuth(['admin', 'worker']), audioUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Não foi recebido áudio. Grave novamente.');
  const audioType = req.file.mimetype.toLowerCase().split(';')[0];
  const result = await transcribeAndTranslate(req.file.buffer, safeFileName(req.file.originalname), audioType);
  res.json(result);
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const input = identifierSchema.safeParse(req.body);
  if (!input.success) throw new HttpError(400, 'Introduza o utilizador e a palavra-passe.');
  const current = requireSupabaseConfig();
  const service = createSupabase(current.serviceRole);
  const anon = createSupabase(current.anon);
  const identifier = input.data.identifier.trim();
  let email = identifier.toLowerCase();
  if (!identifier.includes('@')) {
    const lookup = await service.from('profiles').select('id,role,enabled').eq('username_normalized', identifier.toLowerCase()).maybeSingle();
    checkSupabase(lookup, 'login_lookup');
    if (!lookup.data || !lookup.data.enabled || lookup.data.role !== 'worker') throw new HttpError(401, 'Utilizador ou palavra-passe incorretos.');
    const account = await service.auth.admin.getUserById(lookup.data.id);
    if (account.error || !account.data.user?.email) throw new HttpError(401, 'Utilizador ou palavra-passe incorretos.');
    email = account.data.user.email;
  }
  const signIn = await anon.auth.signInWithPassword({ email, password: input.data.password });
  if (signIn.error || !signIn.data.user || !signIn.data.session) throw new HttpError(401, 'Utilizador ou palavra-passe incorretos.');
  const profileResult = await service.from('profiles').select(profileSelect).eq('id', signIn.data.user.id).maybeSingle();
  checkSupabase(profileResult, 'login_profile');
  const profile = profileResult.data as PortalProfile | null;
  if (!profile?.enabled) throw new HttpError(401, 'A conta está inativa ou ainda não foi autorizada.');
  setSessionCookies(res, signIn.data.session.access_token, signIn.data.session.refresh_token);
  res.json({ user: profile });
}));

app.get('/api/auth/session', asyncRoute(async (req, res) => {
  const context = await loadPortalContext(req, res);
  if (!context) throw new HttpError(401, 'Inicie sessão para continuar.');
  res.json({ user: context.profile });
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  const access = String(req.cookies?.[ACCESS_COOKIE] ?? '');
  const refresh = String(req.cookies?.[REFRESH_COOKIE] ?? '');
  clearSessionCookies(res);
  if (access && refresh && hasSupabaseConfig()) {
    try {
      const anon = createAnonClient();
      await anon.auth.setSession({ access_token: access, refresh_token: refresh });
      await anon.auth.signOut({ scope: 'global' });
    } catch { /* Local cookie clearing remains successful if Auth is temporarily unavailable. */ }
  }
  res.json({ ok: true });
}));

app.post('/api/auth/change-password', requireAuth(['admin', 'client', 'worker']), asyncRoute(async (req, res) => {
  const parsed = z.object({ password: z.string().min(12).max(128) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'A nova palavra-passe deve ter entre 12 e 128 caracteres.');
  const { service, profile } = requireRequestContext(req);
  const changed = await service.auth.admin.updateUserById(profile.id, { password: parsed.data.password });
  if (changed.error) throw new HttpError(500, 'Não foi possível atualizar a palavra-passe.');
  const updated = await service.from('profiles').update({ password_change_required: false }).eq('id', profile.id).select(profileSelect).single();
  checkSupabase(updated, 'clear_password_change_required');
  res.json({ user: updated.data });
}));

// Admin overview and account administration.
app.get('/api/admin/summary', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const { service } = requireRequestContext(req);
  const [projects, clients, workers, open] = await Promise.all([
    service.from('projects').select('id', { count: 'exact', head: true }),
    service.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
    service.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'worker'),
    service.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);
  checkSupabase(projects, 'summary_projects'); checkSupabase(clients, 'summary_clients'); checkSupabase(workers, 'summary_workers'); checkSupabase(open, 'summary_open_projects');
  res.json({ projects: projects.count ?? 0, clients: clients.count ?? 0, workers: workers.count ?? 0, open_projects: open.count ?? 0 });
}));

app.get('/api/admin/workers', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const { service } = requireRequestContext(req);
  const workersResult = await service.from('profiles').select('id,username,full_name,enabled,created_at').eq('role', 'worker').order('created_at', { ascending: false });
  checkSupabase(workersResult, 'list_workers');
  const ids = (workersResult.data ?? []).map((worker) => worker.id);
  if (!ids.length) { res.json({ workers: [] }); return; }
  const assignmentsResult = await service.from('worker_title_assignments').select('worker_id,title_id').in('worker_id', ids);
  checkSupabase(assignmentsResult, 'list_worker_titles');
  const titleIds = [...new Set((assignmentsResult.data ?? []).map((item) => item.title_id))];
  const titlesResult = titleIds.length ? await service.from('worker_titles').select('id,title').in('id', titleIds) : { data: [], error: null };
  checkSupabase(titlesResult, 'list_titles');
  const titles = new Map((titlesResult.data ?? []).map((item) => [item.id, item.title]));
  const assignments = new Map((assignmentsResult.data ?? []).map((item) => [item.worker_id, titles.get(item.title_id) ?? null]));
  res.json({ workers: (workersResult.data ?? []).map((worker) => ({ ...worker, title: assignments.get(worker.id) ?? null })) });
}));

app.get('/api/admin/worker-titles', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const { service } = requireRequestContext(req);
  const result = await service.from('worker_titles').select('id,title,enabled,created_at').order('title');
  checkSupabase(result, 'list_worker_titles');
  res.json({ titles: result.data ?? [] });
}));

app.post('/api/admin/worker-titles', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const parsed = titleSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Introduza um nome de cargo válido.');
  const { service } = requireRequestContext(req);
  const existing = await service.from('worker_titles').select('id,title').eq('title_normalized', parsed.data.title.toLowerCase()).maybeSingle();
  checkSupabase(existing, 'lookup_title');
  if (existing.data) throw new HttpError(409, 'Este cargo já existe.');
  const inserted = await service.from('worker_titles').insert({ title: parsed.data.title }).select('id,title,enabled,created_at').single();
  checkSupabase(inserted, 'create_title');
  res.status(201).json({ title: inserted.data });
}));

async function allUsernames(service: SupabaseClient) {
  const result = await service.from('profiles').select('username_normalized').limit(10000);
  checkSupabase(result, 'list_usernames');
  return new Set((result.data ?? []).map((row) => String(row.username_normalized)));
}
async function workerTitleId(service: SupabaseClient, title?: string) {
  if (!title?.trim()) return null;
  const normalized = title.trim().toLowerCase();
  const found = await service.from('worker_titles').select('id').eq('title_normalized', normalized).maybeSingle();
  checkSupabase(found, 'find_worker_title');
  if (found.data) return found.data.id as number;
  const created = await service.from('worker_titles').insert({ title: title.trim() }).select('id').single();
  if (created.error?.code === '23505') {
    const retry = await service.from('worker_titles').select('id').eq('title_normalized', normalized).single();
    checkSupabase(retry, 'find_created_worker_title');
    if (!retry.data) throw new HttpError(500, 'Não foi possível localizar o cargo criado.');
    return retry.data.id as number;
  }
  checkSupabase(created, 'create_worker_title');
  if (!created.data) throw new HttpError(500, 'Não foi possível criar o cargo.');
  return created.data.id as number;
}

async function createAccount(service: SupabaseClient, args: { fullName: string; email: string; role: 'client' | 'worker'; username: string; title?: string }) {
  let titleId: number | null = null;
  if (args.role === 'worker' && args.title) titleId = await workerTitleId(service, args.title);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const password = randomPassword();
    const fingerprint = passwordFingerprint(password);
    const previous = await service.from('issued_credential_fingerprints').select('fingerprint').eq('fingerprint', fingerprint).maybeSingle();
    checkSupabase(previous, 'check_credential_fingerprint');
    if (previous.data) continue;
    const email = args.role === 'worker' ? `worker+${randomUUID()}@login.obragoito.pt` : args.email;
    const authResult = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: args.fullName, portal_role: args.role } });
    if (authResult.error || !authResult.data.user) throw new HttpError(500, 'Não foi possível criar a conta no Supabase Auth.');
    const userId = authResult.data.user.id;
    const profileResult = await service.from('profiles').insert({ id: userId, role: args.role, username: args.username, full_name: args.fullName, enabled: true, password_change_required: true }).select(profileSelect).single();
    if (profileResult.error) {
      await service.auth.admin.deleteUser(userId);
      if (profileResult.error.code === '23505') throw new HttpError(409, 'O nome de utilizador já está em uso. Atualize a lista e tente novamente.');
      supabaseFailure('create_profile', profileResult.error);
    }
    const fingerprintResult = await service.from('issued_credential_fingerprints').insert({ fingerprint, profile_id: userId });
    if (fingerprintResult.error) {
      await service.auth.admin.deleteUser(userId);
      if (fingerprintResult.error.code === '23505') continue;
      supabaseFailure('store_credential_fingerprint', fingerprintResult.error);
    }
    if (titleId !== null) {
      const assignment = await service.from('worker_title_assignments').insert({ worker_id: userId, title_id: titleId });
      if (assignment.error) {
        await service.from('issued_credential_fingerprints').delete().eq('profile_id', userId);
        await service.auth.admin.deleteUser(userId);
        supabaseFailure('assign_worker_title', assignment.error);
      }
    }
    return { user: profileResult.data as PortalProfile, password, title: args.title ?? '' };
  }
  throw new HttpError(500, 'Não foi possível emitir uma palavra-passe única. Tente novamente.');
}

app.post('/api/admin/workers/import', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const parsed = importWorkersSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Verifique os nomes e cargos do ficheiro.');
  const { service, profile } = requireRequestContext(req);
  const taken = await allUsernames(service);
  const created: { full_name: string; username: string; password: string; title: string; profile_id: string }[] = [];
  const failed: { full_name: string; reason: string }[] = [];
  for (const row of parsed.data.workers) {
    const username = chooseUniqueUsername(row.full_name, taken);
    try {
      const result = await createAccount(service, { fullName: row.full_name, email: '', role: 'worker', username, title: row.title });
      created.push({ full_name: result.user.full_name, username: result.user.username, password: result.password, title: result.title, profile_id: result.user.id });
    } catch (problem) {
      failed.push({ full_name: row.full_name, reason: problem instanceof Error ? problem.message : 'Falha ao criar conta.' });
    }
  }
  if (!created.length) throw new HttpError(500, failed[0]?.reason ?? 'Nenhuma conta foi criada.');
  const audit = await service.from('worker_import_batches').insert({ created_by: profile.id, created_count: created.length, failed_count: failed.length }).select('id').single();
  if (!audit.error && audit.data) {
    const entries = [
      ...created.map((item) => ({ batch_id: audit.data.id, full_name: item.full_name, username: item.username, profile_id: item.profile_id, outcome: 'created' })),
      ...failed.map((item) => ({ batch_id: audit.data.id, full_name: item.full_name, username: null, profile_id: null, outcome: 'failed' })),
    ];
    const entryResult = await service.from('worker_import_entries').insert(entries);
    if (entryResult.error) console.error('worker_import_entries_insert_failed', entryResult.error.code);
  } else console.error('worker_import_batch_insert_failed', audit.error?.code);
  res.status(201).json({ count: created.length, created: created.map(({ profile_id: _profileId, ...item }) => item), failed });
}));

app.post('/api/admin/workers', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const parsed = z.object({ full_name: z.string().trim().min(2).max(120), title: z.string().trim().max(80).optional() }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Introduza o nome completo e um cargo válido.');
  const { service } = requireRequestContext(req);
  const taken = await allUsernames(service);
  const username = chooseUniqueUsername(parsed.data.full_name, taken);
  const result = await createAccount(service, { fullName: parsed.data.full_name, email: '', role: 'worker', username, title: parsed.data.title });
  res.status(201).json({ worker: result.user, password: result.password });
}));

app.get('/api/admin/clients', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const { service } = requireRequestContext(req);
  const result = await service.from('profiles').select('id,username,full_name,enabled,created_at').eq('role', 'client').order('created_at', { ascending: false });
  checkSupabase(result, 'list_clients');
  res.json({ clients: result.data ?? [] });
}));

app.post('/api/admin/clients', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Introduza o nome e um email válido.');
  const { service } = requireRequestContext(req);
  const taken = await allUsernames(service);
  const username = chooseUniqueUsername(parsed.data.full_name, taken);
  const result = await createAccount(service, { fullName: parsed.data.full_name, email: parsed.data.email.toLowerCase(), role: 'client', username });
  res.status(201).json({ client: result.user, password: result.password });
}));

app.post('/api/admin/users/:id/status', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const { service } = requireRequestContext(req);
  const input = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!input.success) throw new HttpError(400, 'Estado inválido.');
  const updated = await service.from('profiles').update({ enabled: input.data.enabled, updated_at: new Date().toISOString() }).eq('id', req.params.id).select(profileSelect).maybeSingle();
  checkSupabase(updated, 'set_account_status');
  if (!updated.data) throw new HttpError(404, 'Conta não encontrada.');
  res.json({ user: updated.data });
}));

// Projects, worker assignments and client-visible publishing.
app.get('/api/admin/projects', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const { service } = requireRequestContext(req);
  const result = await service.from('projects').select('id,name,description,status,published,published_at,created_at,updated_at').order('created_at', { ascending: false });
  checkSupabase(result, 'list_projects');
  res.json({ projects: result.data ?? [] });
}));

app.post('/api/admin/projects', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Verifique o nome e as atribuições da obra.');
  const { service, profile } = requireRequestContext(req);
  const input = parsed.data;
  if (input.client_id) {
    const client = await service.from('profiles').select('id').eq('id', input.client_id).eq('role', 'client').eq('enabled', true).maybeSingle();
    checkSupabase(client, 'validate_project_client');
    if (!client.data) throw new HttpError(400, 'O cliente selecionado não existe ou está inativo.');
  }
  if (input.worker_ids.length) {
    const workers = await service.from('profiles').select('id').in('id', input.worker_ids).eq('role', 'worker').eq('enabled', true);
    checkSupabase(workers, 'validate_project_workers');
    if ((workers.data ?? []).length !== input.worker_ids.length) throw new HttpError(400, 'Um ou mais trabalhadores são inválidos ou estão inativos.');
  }
  const publish = Boolean(input.client_id);
  const created = await service.from('projects').insert({ name: input.name, description: input.description ?? null, status: 'active', published: publish, published_at: publish ? new Date().toISOString() : null, created_by: profile.id }).select('id,name,description,status,published,published_at,created_at,updated_at').single();
  checkSupabase(created, 'create_project');
  if (!created.data) throw new HttpError(500, 'Não foi possível criar a obra.');
  const projectId = created.data.id;
  if (input.client_id) {
    const assignment = await service.from('project_clients').insert({ project_id: projectId, client_id: input.client_id });
    if (assignment.error) { await service.from('projects').delete().eq('id', projectId); supabaseFailure('assign_client', assignment.error); }
  }
  if (input.worker_ids.length) {
    const assignments = await service.from('project_workers').insert(input.worker_ids.map((workerId) => ({ project_id: projectId, worker_id: workerId })));
    if (assignments.error) { await service.from('projects').delete().eq('id', projectId); supabaseFailure('assign_workers', assignments.error); }
  }
  res.status(201).json({ project: created.data });
}));

app.post('/api/admin/projects/:id/updates', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Introduza o título e o texto da atualização.');
  const { service, profile } = requireRequestContext(req);
  const project = await service.from('projects').select('id').eq('id', req.params.id).maybeSingle();
  checkSupabase(project, 'check_update_project');
  if (!project.data) throw new HttpError(404, 'Obra não encontrada.');
  const result = await service.from('project_updates').insert({ project_id: req.params.id, title: parsed.data.title, body: parsed.data.body, published: true, published_at: new Date().toISOString(), author_id: profile.id }).select('id,title,body,published,published_at,created_at').single();
  checkSupabase(result, 'publish_client_update');
  res.status(201).json({ update: result.data });
}));

app.get('/api/admin/internal', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const { service } = requireRequestContext(req);
  const [messagesResult, reportsResult, projectsResult, profilesResult] = await Promise.all([
    service.from('internal_messages').select('id,project_id,sender_id,recipient_id,body,created_at').order('created_at', { ascending: false }).limit(300),
    service.from('progress_reports').select('id,project_id,worker_id,body,created_at').order('created_at', { ascending: false }).limit(300),
    service.from('projects').select('id,name'),
    service.from('profiles').select('id,full_name,role'),
  ]);
  checkSupabase(messagesResult, 'list_internal_messages'); checkSupabase(reportsResult, 'list_progress_reports'); checkSupabase(projectsResult, 'list_project_names'); checkSupabase(profilesResult, 'list_sender_names');
  const projectNames = new Map((projectsResult.data ?? []).map((item) => [item.id, item.name]));
  const names = new Map((profilesResult.data ?? []).map((item) => [item.id, item.full_name]));
  const roles = new Map((profilesResult.data ?? []).map((item) => [item.id, item.role]));
  const messages = [
    ...(messagesResult.data ?? []).map((item) => ({ id: item.id, project_id: item.project_id, project_name: projectNames.get(item.project_id), sender_name: names.get(item.sender_id), recipient_id: item.recipient_id, recipient_name: item.recipient_id ? names.get(item.recipient_id) : undefined, from_admin: roles.get(item.sender_id) === 'admin', body: item.body, created_at: item.created_at, type: 'message' as const })),
    ...(reportsResult.data ?? []).map((item) => ({ id: item.id, project_id: item.project_id, project_name: projectNames.get(item.project_id), sender_name: names.get(item.worker_id), from_admin: false, body: item.body, created_at: item.created_at, type: 'report' as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ messages });
}));

app.post('/api/admin/messages', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const parsed = z.object({ worker_id: z.string().uuid(), project_id: z.string().uuid(), body: z.string().trim().min(2).max(5000) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Escolha um trabalhador, uma obra atribuída e escreva uma mensagem.');
  const { service, profile } = requireRequestContext(req);
  const [worker, assignment] = await Promise.all([
    service.from('profiles').select('id').eq('id', parsed.data.worker_id).eq('role', 'worker').eq('enabled', true).maybeSingle(),
    service.from('project_workers').select('project_id').eq('project_id', parsed.data.project_id).eq('worker_id', parsed.data.worker_id).maybeSingle(),
  ]);
  checkSupabase(worker, 'validate_message_worker'); checkSupabase(assignment, 'validate_message_assignment');
  if (!worker.data || !assignment.data) throw new HttpError(400, 'O trabalhador tem de estar ativo e atribuído à obra selecionada.');
  const result = await service.from('internal_messages').insert({ project_id: parsed.data.project_id, sender_id: profile.id, recipient_id: parsed.data.worker_id, body: parsed.data.body }).select('id,project_id,recipient_id,body,created_at').single();
  checkSupabase(result, 'send_worker_message');
  res.status(201).json({ message: result.data });
}));

// Client portal: RLS-scoped reads use the user's own access token, never the service-role client.
app.get('/api/client/projects', requireAuth(['client']), asyncRoute(async (req, res) => {
  const { userClient } = requireRequestContext(req);
  const result = await userClient.from('projects').select('id,name,description,status,published,updated_at').order('updated_at', { ascending: false });
  checkSupabase(result, 'client_projects');
  res.json({ projects: result.data ?? [] });
}));
app.get('/api/client/projects/:id', requireAuth(['client']), asyncRoute(async (req, res) => {
  const { userClient } = requireRequestContext(req);
  const projectResult = await userClient.from('projects').select('id,name,description,status,published,updated_at').eq('id', req.params.id).maybeSingle();
  checkSupabase(projectResult, 'client_project_detail');
  if (!projectResult.data) throw new HttpError(404, 'Obra não encontrada ou não atribuída à sua conta.');
  const updatesResult = await userClient.from('project_updates').select('id,title,body,published_at').eq('project_id', req.params.id).eq('published', true).order('published_at', { ascending: false });
  checkSupabase(updatesResult, 'client_project_updates');
  res.json({ project: projectResult.data, updates: updatesResult.data ?? [] });
}));
app.get('/api/client/documents', requireAuth(['client']), asyncRoute(async (req, res) => {
  const { userClient } = requireRequestContext(req);
  const result = await userClient.from('project_documents').select('id,project_id,file_name,audience,created_at').eq('audience', 'client').order('created_at', { ascending: false });
  checkSupabase(result, 'client_documents');
  const ids = [...new Set((result.data ?? []).map((item) => item.project_id))];
  const projects = ids.length ? await userClient.from('projects').select('id,name').in('id', ids) : { data: [], error: null };
  checkSupabase(projects, 'client_document_project_names');
  const names = new Map((projects.data ?? []).map((item) => [item.id, item.name]));
  res.json({ documents: (result.data ?? []).map((item) => ({ id: item.id, project_id: item.project_id, project_name: names.get(item.project_id), file_name: item.file_name, audience: item.audience, created_at: item.created_at })) });
}));

// Worker portal: only the assigned projects and the signed-in worker's own messages/reports are visible under RLS.
app.get('/api/worker/projects', requireAuth(['worker']), asyncRoute(async (req, res) => {
  const { userClient } = requireRequestContext(req);
  const result = await userClient.from('projects').select('id,name,description,status,published,updated_at').order('updated_at', { ascending: false });
  checkSupabase(result, 'worker_projects');
  res.json({ projects: result.data ?? [] });
}));
app.get('/api/worker/projects/:id', requireAuth(['worker']), asyncRoute(async (req, res) => {
  const { userClient } = requireRequestContext(req);
  const result = await userClient.from('projects').select('id,name,description,status,published,updated_at').eq('id', req.params.id).maybeSingle();
  checkSupabase(result, 'worker_project_detail');
  if (!result.data) throw new HttpError(404, 'Obra não encontrada ou não atribuída à sua conta.');
  res.json({ project: result.data });
}));
app.get('/api/worker/messages', requireAuth(['worker']), asyncRoute(async (req, res) => {
  const { userClient, profile } = requireRequestContext(req);
  const [messagesResult, reportsResult, projectsResult] = await Promise.all([
    userClient.from('internal_messages').select('id,project_id,recipient_id,body,created_at').order('created_at', { ascending: false }).limit(200),
    userClient.from('progress_reports').select('id,project_id,body,created_at').order('created_at', { ascending: false }).limit(200),
    userClient.from('projects').select('id,name'),
  ]);
  checkSupabase(messagesResult, 'worker_messages'); checkSupabase(reportsResult, 'worker_reports'); checkSupabase(projectsResult, 'worker_message_projects');
  const names = new Map((projectsResult.data ?? []).map((item) => [item.id, item.name]));
  const messages = [
    ...(messagesResult.data ?? []).map((item) => ({ id: item.id, project_id: item.project_id, body: item.body, created_at: item.created_at, project_name: names.get(item.project_id), from_admin: item.recipient_id === profile.id, type: 'message' as const })),
    ...(reportsResult.data ?? []).map((item) => ({ ...item, project_name: names.get(item.project_id), from_admin: false, type: 'report' as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ messages });
}));
app.post('/api/worker/messages', requireAuth(['worker']), asyncRoute(async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Escolha uma obra e escreva uma mensagem.');
  const { userClient, profile } = requireRequestContext(req);
  const result = await userClient.from('internal_messages').insert({ project_id: parsed.data.project_id, sender_id: profile.id, recipient_id: null, body: parsed.data.body }).select('id,project_id,body,created_at').single();
  checkSupabase(result, 'create_worker_message');
  res.status(201).json({ message: result.data });
}));
app.post('/api/worker/reports', requireAuth(['worker']), asyncRoute(async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'Escolha uma obra e escreva um relatório.');
  const { userClient, profile } = requireRequestContext(req);
  const result = await userClient.from('progress_reports').insert({ project_id: parsed.data.project_id, worker_id: profile.id, body: parsed.data.body }).select('id,project_id,body,created_at').single();
  checkSupabase(result, 'create_worker_report');
  res.status(201).json({ report: result.data });
}));

// Files stay in one private Supabase Storage bucket. A fresh signed URL is only issued after an RLS check.
app.get('/api/admin/documents', requireAuth(['admin']), asyncRoute(async (req, res) => {
  const { service } = requireRequestContext(req);
  const result = await service.from('project_documents').select('id,project_id,file_name,audience,created_at').order('created_at', { ascending: false });
  checkSupabase(result, 'admin_documents');
  const ids = [...new Set((result.data ?? []).map((item) => item.project_id))];
  const projects = ids.length ? await service.from('projects').select('id,name').in('id', ids) : { data: [], error: null };
  checkSupabase(projects, 'admin_document_project_names');
  const names = new Map((projects.data ?? []).map((item) => [item.id, item.name]));
  res.json({ documents: (result.data ?? []).map((item) => ({ id: item.id, project_id: item.project_id, project_name: names.get(item.project_id), file_name: item.file_name, audience: item.audience, created_at: item.created_at })) });
}));
app.post('/api/admin/documents', requireAuth(['admin']), upload.single('file'), asyncRoute(async (req, res) => {
  const parsed = documentSchema.safeParse(req.body);
  if (!parsed.success || !req.file) throw new HttpError(400, 'Escolha a obra, a audiência e um ficheiro válido.');
  const { service, profile } = requireRequestContext(req);
  const project = await service.from('projects').select('id').eq('id', parsed.data.project_id).maybeSingle();
  checkSupabase(project, 'validate_document_project');
  if (!project.data) throw new HttpError(404, 'Obra não encontrada.');
  const fileName = safeFileName(req.file.originalname);
  const storagePath = `${parsed.data.project_id}/${randomUUID()}-${fileName}`;
  const uploadResult = await service.storage.from(STORAGE_BUCKET).upload(storagePath, req.file.buffer, { contentType: req.file.mimetype || 'application/octet-stream', upsert: false });
  if (uploadResult.error) supabaseFailure('upload_project_document', uploadResult.error);
  const metadata = await service.from('project_documents').insert({ project_id: parsed.data.project_id, storage_path: storagePath, file_name: fileName, audience: parsed.data.audience, uploaded_by: profile.id }).select('id,project_id,file_name,audience,created_at').single();
  if (metadata.error) {
    await service.storage.from(STORAGE_BUCKET).remove([storagePath]);
    supabaseFailure('store_document_metadata', metadata.error);
  }
  res.status(201).json({ document: metadata.data });
}));
app.post('/api/documents/:id/download', requireAuth(['admin', 'client', 'worker']), asyncRoute(async (req, res) => {
  const { userClient, service } = requireRequestContext(req);
  const allowed = await userClient.from('project_documents').select('id,storage_path').eq('id', req.params.id).maybeSingle();
  checkSupabase(allowed, 'authorize_document_download');
  if (!allowed.data?.storage_path) throw new HttpError(404, 'Documento não encontrado ou não partilhado com a sua conta.');
  const signed = await service.storage.from(STORAGE_BUCKET).createSignedUrl(allowed.data.storage_path, 300);
  if (signed.error || !signed.data?.signedUrl) supabaseFailure('sign_document_url', signed.error);
  res.json({ url: signed.data.signedUrl });
}));

// Production: four separate root applications selected by explicitly configured hostnames;
// never publish admin/client/worker screens beneath /admin, /clientes or /equipa on the public origin.
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const distRoot = path.resolve(__dirname, '../dist/apps');
  const hostMap: Record<string, string> = {
    [(process.env.PUBLIC_HOST ?? 'obragoito.pt').toLowerCase()]: 'public',
    [(process.env.ADMIN_HOST ?? 'gestao.obragoito.pt').toLowerCase()]: 'admin',
    [(process.env.CLIENTS_HOST ?? 'clientes.obragoito.pt').toLowerCase()]: 'clients',
    [(process.env.WORKERS_HOST ?? 'equipa.obragoito.pt').toLowerCase()]: 'workers',
  };
  const siteForRequest = (req: Request) => {
    const forwarded = req.get('x-forwarded-host')?.split(',')[0]?.trim();
    const rawHost = forwarded || req.get('host') || '';
    const hostname = rawHost.toLowerCase().replace(/:\d+$/, '');
    return hostMap[hostname] ?? 'public';
  };
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) { next(); return; }
    express.static(path.join(distRoot, siteForRequest(req)), { index: false, maxAge: '1h', fallthrough: true })(req, res, next);
  });
  app.get(/.*/, (req, res) => {
    if (path.extname(req.path)) { res.status(404).type('text/plain').send('Not found'); return; }
    const site = siteForRequest(req);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(distRoot, site, 'index.html'));
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    const limitMb = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? `O ficheiro ultrapassa o limite de ${limitMb} MB.` : 'Não foi possível processar o ficheiro.' });
    return;
  }
  const status = error instanceof HttpError || error instanceof VoiceProcessingError ? error.status : 500;
  const message = error instanceof HttpError || error instanceof VoiceProcessingError ? error.message : 'Ocorreu um erro inesperado. Tente novamente.';
  if (!(error instanceof HttpError) && !(error instanceof VoiceProcessingError)) console.error('[api] unexpected_error');
  res.status(status).json({ error: message });
});

const port = Number(process.env.NODE_ENV === 'production' ? process.env.PORT ?? 3000 : process.env.API_PORT ?? 4000);
if (!process.env.VERCEL) app.listen(port, '0.0.0.0', () => console.log(`[api] listening on ${port}`));

export default app;
