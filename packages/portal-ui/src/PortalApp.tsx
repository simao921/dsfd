import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness,
  Building2, Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardList, FilePlus2,
  FileText, FolderKanban, HardHat, LayoutDashboard, LogOut, Mail, Menu, MessageSquareText,
  Mic, MicOff, Plus, Search, Settings2, ShieldCheck, Square, Upload, UserRound, Users, X,
} from 'lucide-react';
import { api, apiPost, ApiError, type PortalRole, type PortalUser } from './api';

const UPLOAD_LIMIT_MB = Number(import.meta.env.VITE_UPLOAD_LIMIT_MB) || 15;

type PortalKind = 'admin' | 'clients' | 'workers';
type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived';
type Project = { id: string; name: string; description: string | null; status: ProjectStatus; published?: boolean; updated_at?: string };
type Worker = { id: string; username: string; full_name: string; enabled: boolean; title?: string | null; created_at?: string };
type Client = { id: string; username: string; full_name: string; enabled: boolean; created_at?: string };
type ProjectUpdate = { id: string; title: string; body: string; published_at: string };
type PortalDocument = { id: string; project_id: string; project_name?: string; file_name: string; audience: string; created_at: string };
type InternalMessage = { id: string; project_id: string; project_name?: string; sender_name?: string; recipient_name?: string; recipient_id?: string | null; from_admin?: boolean; body: string; created_at: string; type?: 'message' | 'report' };
type WorkerCredential = { full_name: string; username: string; password: string; title: string };
type WorkerImportRow = { full_name: string; title?: string };

const kindConfig: Record<PortalKind, { title: string; wordmark: string; subtitle: string; expectedRole: PortalRole; loginTitle: string; loginDescription: string; loginLabel: string; accent: string }> = {
  admin: { title: 'Gestão Obragoito', wordmark: 'GESTÃO', subtitle: 'Área de administração', expectedRole: 'admin', loginTitle: 'Gestão com rigor.', loginDescription: 'Entre para gerir obras, clientes e equipa.', loginLabel: 'Email de administrador', accent: 'Administração' },
  clients: { title: 'Clientes Obragoito', wordmark: 'CLIENTES', subtitle: 'Área reservada a clientes', expectedRole: 'client', loginTitle: 'A sua obra, mais perto.', loginDescription: 'Consulte as atualizações e documentos que a Obragoito partilhou consigo.', loginLabel: 'Email', accent: 'Portal de clientes' },
  workers: { title: 'Equipa Obragoito', wordmark: 'EQUIPA', subtitle: 'Área reservada a trabalhadores', expectedRole: 'worker', loginTitle: 'A obra acontece em equipa.', loginDescription: 'Entre para consultar as obras que lhe foram atribuídas e comunicar com a administração.', loginLabel: 'Nome de utilizador', accent: 'Portal de trabalhadores' },
};

const navByKind: Record<PortalKind, { to: string; label: string; icon: typeof LayoutDashboard }[]> = {
  admin: [
    { to: '/', label: 'Visão geral', icon: LayoutDashboard },
    { to: '/obras', label: 'Obras', icon: FolderKanban },
    { to: '/clientes', label: 'Clientes', icon: Users },
    { to: '/trabalhadores', label: 'Trabalhadores', icon: HardHat },
    { to: '/mensagens', label: 'Comunicações', icon: MessageSquareText },
    { to: '/documentos', label: 'Documentos', icon: FileText },
  ],
  clients: [
    { to: '/', label: 'Visão geral', icon: LayoutDashboard },
    { to: '/obras', label: 'As minhas obras', icon: FolderKanban },
    { to: '/documentos', label: 'Documentos', icon: FileText },
  ],
  workers: [
    { to: '/', label: 'Visão geral', icon: LayoutDashboard },
    { to: '/obras', label: 'Obras atribuídas', icon: FolderKanban },
    { to: '/comunicacoes', label: 'Comunicações', icon: MessageSquareText },
  ],
};

function usePortalSession() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<{ user: PortalUser }>('/auth/session')
      .then(({ user: current }) => { if (active) setUser(current); })
      .catch((problem: unknown) => {
        if (!active) return;
        if (problem instanceof ApiError && problem.status === 503) setSetupError(problem.message);
        else if (!(problem instanceof ApiError && problem.status === 401)) setError(problem instanceof Error ? problem.message : 'Não foi possível carregar a sessão.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const signIn = async (identifier: string, password: string) => {
    setError('');
    const { user: current } = await apiPost<{ user: PortalUser }>('/auth/login', { identifier, password });
    setUser(current);
  };
  const changeInitialPassword = async (password: string) => {
    setError('');
    const { user: current } = await apiPost<{ user: PortalUser }>('/auth/change-password', { password });
    setUser(current);
  };
  const signOut = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } finally { setUser(null); }
  };
  return { user, loading, setupError, error, setError, signIn, signOut, changeInitialPassword };
}

function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<T>(path).then((value) => { if (active) { setData(value); setError(''); } }).catch((problem: unknown) => {
      if (active) setError(problem instanceof Error ? problem.message : 'Não foi possível carregar estes dados.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, reload]);
  return { data, error, loading, refresh: () => setReload((value) => value + 1), setData };
}

function BrandMark({ dark = false }: { dark?: boolean }) {
  return <span className={`portal-brand ${dark ? 'portal-brand-dark' : ''}`}><span className="portal-brand-mark"><i /><i /><i /></span><span>OBRAGOITO<span className="portal-brand-dot">.</span></span></span>;
}

function LoginScreen({ kind, onLogin, setupError, initialError }: { kind: PortalKind; onLogin: (identifier: string, password: string) => Promise<void>; setupError: string; initialError: string }) {
  const meta = kindConfig[kind];
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError('');
    try { await onLogin(identifier.trim(), password); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Não foi possível iniciar sessão.'); }
    finally { setSubmitting(false); }
  };
  return <main className={`login-screen login-${kind}`}>
    <div className="login-art" aria-hidden="true"><div className="login-art-image" /><div className="login-art-shade" /><div className="login-lines" /><div className="login-art-caption">OBRAGOITO <span>·</span> OBRA FEITA DESDE 1991</div><div className="login-art-count">35<sup>+</sup><small>ANOS DE<br />EXPERIÊNCIA</small></div></div>
    <section className="login-panel">
      <div className="login-panel-top"><Link to="/" className="login-home"><BrandMark dark /></Link><span className="login-site-label">{meta.accent}</span></div>
      <div className="login-form-wrap"><div className="login-kicker"><span className="status-dot" />ACESSO RESERVADO</div><h1>{meta.loginTitle}</h1><p className="login-description">{meta.loginDescription}</p>
        {(setupError || initialError) && <div className="portal-alert portal-alert-warn"><CircleHelp size={17} /><span>{setupError || initialError}</span></div>}
        {error && <div className="portal-alert portal-alert-error"><CircleHelp size={17} /><span>{error}</span></div>}
        <form onSubmit={submit} className="login-form"><label>{meta.loginLabel}<input autoComplete={kind === 'workers' ? 'username' : 'email'} type={kind === 'workers' ? 'text' : 'email'} value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={kind === 'workers' ? 'ex.: joao.silva' : 'nome@empresa.pt'} required /></label><label>Palavra-passe<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Introduza a sua palavra-passe" required /></label><button className="button-primary login-submit" type="submit" disabled={submitting}>{submitting ? 'A validar…' : 'Iniciar sessão'}<ArrowRight size={17} /></button></form>
        <div className="login-assist">{kind === 'workers' ? <><HardHat size={16} /><span>Não tem acesso? Contacte a administração para receber as credenciais.</span></> : <><ShieldCheck size={16} /><span>O acesso é criado e gerido pela Obragoito. Não existe registo público.</span></>}</div>
      </div>
      <div className="login-panel-footer"><span>© {new Date().getFullYear()} Obragoito</span><a href="https://obragoito.pt/" target="_blank" rel="noreferrer">Site público <ArrowUpRight size={13} /></a></div>
    </section>
  </main>;
}

function InitialPasswordScreen({ kind, fullName, onChange, onLogout }: { kind: PortalKind; fullName: string; onChange: (password: string) => Promise<void>; onLogout: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (password.length < 12) { setError('Use pelo menos 12 caracteres.'); return; }
    if (password !== confirmation) { setError('As palavras-passe não coincidem.'); return; }
    setWorking(true);
    try { await onChange(password); } catch (problem) { setError(problem instanceof Error ? problem.message : 'Não foi possível alterar a palavra-passe.'); }
    finally { setWorking(false); }
  };
  return <main className={`login-screen login-${kind} initial-password-screen`}>
    <div className="login-art" aria-hidden="true"><div className="login-art-image" /><div className="login-art-shade" /><div className="login-lines" /><div className="login-art-caption">OBRAGOITO <span>·</span> ACESSO PROTEGIDO</div><div className="login-art-count"><ShieldCheck size={34} /><small>PRIMEIRO<br />ACESSO</small></div></div>
    <section className="login-panel"><div className="login-panel-top"><Link to="/" className="login-home"><BrandMark dark /></Link><span className="login-site-label">{kindConfig[kind].accent}</span></div>
      <div className="login-form-wrap"><div className="login-kicker"><span className="status-dot" />SEGURANÇA DA CONTA</div><h1>Olá, {fullName}.</h1><p className="login-description">Por segurança, defina uma palavra-passe pessoal antes de continuar. Use 12 ou mais caracteres.</p>
        {error && <div className="portal-alert portal-alert-error"><CircleHelp size={17} /><span>{error}</span></div>}
        <form onSubmit={submit} className="login-form"><label>Nova palavra-passe<input autoComplete="new-password" type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label>Confirmar palavra-passe<input autoComplete="new-password" type="password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label><button className="button-primary login-submit" type="submit" disabled={working}>{working ? 'A proteger a conta…' : 'Guardar palavra-passe'}<ArrowRight size={17} /></button></form>
        <div className="login-assist"><ShieldCheck size={16} /><span>A palavra-passe inicial deixa de funcionar depois desta alteração.</span></div>
      </div><div className="login-panel-footer"><span>© {new Date().getFullYear()} Obragoito</span><button className="subtle-link" onClick={onLogout}>Terminar sessão</button></div>
    </section>
  </main>;
}

function PortalAppFrame({ kind, user, onLogout, children }: { kind: PortalKind; user: PortalUser; onLogout: () => void; children: ReactNode }) {
  const meta = kindConfig[kind];
  const location = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  useEffect(() => setMobileMenu(false), [location.pathname]);
  const nameParts = user.full_name.trim().split(/\s+/);
  const initials = `${nameParts[0]?.[0] ?? 'O'}${nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : ''}`.toUpperCase();
  return <div className="portal-app-shell">
    <aside className={`portal-sidebar ${mobileMenu ? 'portal-sidebar-open' : ''}`}>
      <div className="portal-sidebar-brand"><Link to="/"><BrandMark /></Link><button className="mobile-sidebar-close" onClick={() => setMobileMenu(false)} aria-label="Fechar menu"><X size={19} /></button></div>
      <div className="sidebar-caption">{meta.subtitle}</div>
      <nav className="portal-nav" aria-label="Navegação do portal">{navByKind[kind].map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => isActive ? 'portal-nav-link is-active' : 'portal-nav-link'}><item.icon size={17} strokeWidth={1.7} /><span>{item.label}</span>{item.to === '/' && <span className="nav-active-mark" />}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><CircleHelp size={16} /><span><strong>Precisa de ajuda?</strong><small>Fale com a administração</small></span><ArrowUpRight size={14} /></div><a href="https://obragoito.pt/" className="portal-public-link" target="_blank" rel="noreferrer">Site público <ArrowUpRight size={13} /></a><span className="portal-version">OBRAGOITO · {kind === 'admin' ? 'GESTÃO' : kind === 'clients' ? 'CLIENTES' : 'EQUIPA'}</span></div>
    </aside>
    {mobileMenu && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMobileMenu(false)} />}
    <div className="portal-main">
      <header className="portal-topbar"><button className="mobile-menu-trigger" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="topbar-title">{meta.accent}</div><div className="topbar-actions"><span className="secure-label"><ShieldCheck size={14} />ACESSO SEGURO</span><span className="topbar-divider" /><button className="profile-menu" onClick={onLogout} title="Terminar sessão"><span className="profile-avatar">{initials}</span><span className="profile-text"><strong>{user.full_name}</strong><small>{user.role === 'admin' ? 'Administrador' : user.role === 'client' ? 'Cliente' : 'Trabalhador'}</small></span><LogOut size={16} /></button></div></header>
      <div className="portal-content">{children}</div>
      <footer className="portal-footer"><span>Obragoito · Construções e Obras Públicas</span><span>Informação confidencial <ShieldCheck size={13} /></span></footer>
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="portal-page-heading"><div><div className="portal-eyebrow"><span />{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

function SummaryCard({ icon: Icon, label, value, hint }: { icon: typeof Building2; label: string; value: string | number; hint: string }) {
  return <article className="summary-card"><div className="summary-card-icon"><Icon size={18} strokeWidth={1.8} /></div><span className="summary-card-label">{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

function DataState({ loading, error, empty, children }: { loading: boolean; error: string; empty?: boolean; children?: ReactNode }) {
  if (loading) return <div className="data-state"><span className="loading-spinner" /><span>A carregar dados…</span></div>;
  if (error) return <div className="data-state data-state-error"><CircleHelp size={20} /><span>{error}</span></div>;
  if (empty) return <div className="empty-state"><div className="empty-icon"><FolderKanban size={22} /></div><strong>Ainda não existem registos</strong><span>Quando a administração adicionar informação, ela aparecerá aqui.</span></div>;
  return <>{children}</>;
}

function VoiceTextarea({ label, value, onChange, placeholder, rows = 4, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; rows?: number; required?: boolean }) {
  const [enabled, setEnabled] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startRecording = async () => {
    setError(''); setNotice(''); setDetectedLanguage(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este browser não permite gravação. Use um browser atualizado ou escreva a mensagem.'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48_000 });
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null; recorderRef.current = null; setRecording(false);
        const contentType = recorder.mimeType || 'audio/webm';
        const extension = contentType.includes('mp4') ? 'm4a' : contentType.includes('ogg') ? 'ogg' : contentType.includes('mpeg') ? 'mp3' : contentType.includes('wav') ? 'wav' : 'webm';
        const audio = new Blob(chunks, { type: contentType });
        if (!audio.size) { setError('Não foi captada fala. Tente novamente ou escreva.'); return; }
        if (audio.size > UPLOAD_LIMIT_MB * 1024 * 1024) { setError(`O áudio excede ${UPLOAD_LIMIT_MB} MB. Grave uma mensagem mais curta ou escreva.`); return; }
        setTranscribing(true); setNotice('A identificar o idioma, transcrever e traduzir para Português (Portugal)…');
        const form = new FormData(); form.set('file', audio, `mensagem.${extension}`);
        void api<{ text: string; detectedLanguage: string | null; targetLanguage: 'pt-PT' }>('/speech/transcribe', { method: 'POST', body: form })
          .then((result) => {
            const text = result.text.trim();
            if (!text) throw new Error('Não foi obtido texto. Tente novamente ou escreva.');
            onChange(value.trim() ? `${value.trimEnd()} ${text}` : text);
            setDetectedLanguage(result.detectedLanguage);
            setNotice(`Transcrição traduzida para Português (Portugal)${result.detectedLanguage ? ` · idioma detetado: ${result.detectedLanguage}` : ''}. Reveja e edite antes de enviar.`);
          })
          .catch((problem: unknown) => { setNotice(''); setError(problem instanceof Error ? problem.message : 'Falhou a transcrição. Escreva a mensagem manualmente.'); })
          .finally(() => setTranscribing(false));
      });
      recorder.start(); setRecording(true); setNotice('A gravar. Prima “Parar” quando terminar de falar.');
    } catch (problem) {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
      const denied = problem instanceof DOMException && (problem.name === 'NotAllowedError' || problem.name === 'PermissionDeniedError');
      setError(denied ? 'O acesso ao microfone foi recusado. Autorize-o nas definições do browser ou escreva a mensagem.' : 'Não foi possível abrir o microfone. Verifique as permissões ou escreva a mensagem.');
    }
  };

  const stopRecording = () => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); };
  return <div className="voice-textarea-field">
    <label className="voice-textarea-label">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} required={required} /></label>
    <div className="voice-entry-controls">
      <label className="voice-entry-toggle"><input type="checkbox" checked={enabled} onChange={(event) => { const next = event.target.checked; setEnabled(next); if (!next) stopRecording(); }} /><span>{enabled ? 'Ditado ativo' : 'Ditado desligado'}</span></label>
      <button type="button" className={`voice-record-button ${recording ? 'is-recording' : ''}`} disabled={!enabled || transcribing} onClick={recording ? stopRecording : startRecording} aria-label={recording ? 'Parar gravação' : 'Gravar e transcrever'}>
        {recording ? <Square size={14} fill="currentColor" /> : enabled ? <Mic size={15} /> : <MicOff size={15} />}{recording ? 'Parar gravação' : transcribing ? 'A processar…' : enabled ? 'Falar' : 'Ditado desligado'}
      </button>
    </div>
    <p className="voice-processing-note" aria-live="polite">{notice || 'A língua é detetada automaticamente e o resultado é traduzido para português. O áudio não fica guardado; só o texto enviado é conservado.'}</p>
    {detectedLanguage && <span className="voice-language-chip">Idioma de origem detetado: {detectedLanguage} → Português (Portugal)</span>}
    {error && <div className="inline-notice error-notice" role="alert">{error}</div>}
  </div>;
}

function AdminHome() {
  const { data, loading, error } = useResource<{ projects: number; clients: number; workers: number; open_projects: number }>('/admin/summary');
  return <>
    <PageHeading eyebrow="Painel de gestão" title="Bom dia." description="Acompanhe as obras, clientes e equipa da Obragoito." />
    <div className="summary-grid"><SummaryCard icon={FolderKanban} label="Obras registadas" value={loading ? '—' : data?.projects ?? '—'} hint={data?.open_projects !== undefined ? `${data.open_projects} em curso` : 'Dados do projeto'} /><SummaryCard icon={Users} label="Clientes" value={loading ? '—' : data?.clients ?? '—'} hint="Contas de clientes" /><SummaryCard icon={HardHat} label="Trabalhadores" value={loading ? '—' : data?.workers ?? '—'} hint="Contas da equipa" /></div>
    {error && <div className="portal-alert portal-alert-warn"><CircleHelp size={17} />{error}</div>}
    <div className="dashboard-grid"><section className="panel-card dashboard-start"><div className="panel-heading"><div><span className="panel-kicker">PRIMEIROS PASSOS</span><h2>Preparar o espaço de trabalho</h2></div><Settings2 size={18} /></div><p>Adicione clientes e trabalhadores e crie as obras a que cada pessoa terá acesso. Não existe conteúdo de demonstração.</p><div className="quick-actions"><Link to="/obras"><Plus size={16} />Criar primeira obra</Link><Link to="/trabalhadores"><Users size={16} />Adicionar equipa</Link><Link to="/clientes"><UserRound size={16} />Criar cliente</Link></div></section><section className="panel-card dashboard-checklist"><div className="panel-heading"><div><span className="panel-kicker">CONTROLO DE ACESSOS</span><h2>Dados protegidos</h2></div><ShieldCheck size={18} /></div><div className="check-row"><CheckCircle2 size={16} /><span>Portais separados por função</span></div><div className="check-row"><CheckCircle2 size={16} /><span>Obras atribuídas a cada utilizador</span></div><div className="check-row"><CheckCircle2 size={16} /><span>Atualizações de clientes publicadas pelo admin</span></div></section></div>
    <div className="portal-setup-note"><span className="setup-note-mark">i</span><div><strong>Os dados começam vazios de propósito.</strong><span>As obras e contas reais serão carregadas pela administração quando tiver a informação.</span></div></div>
  </>;
}

function slugHeader(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function rowToWorker(row: Record<string, unknown>): WorkerImportRow | null {
  const normalized = new Map<string, unknown>();
  Object.entries(row).forEach(([key, value]) => normalized.set(slugHeader(key), value));
  const name = normalized.get('nome') ?? normalized.get('nome_completo') ?? normalized.get('funcionario') ?? normalized.get('name') ?? normalized.get('full_name');
  const title = normalized.get('cargo') ?? normalized.get('funcao') ?? normalized.get('position') ?? normalized.get('title');
  const fullName = String(name ?? '').trim();
  if (!fullName) return null;
  return { full_name: fullName, title: String(title ?? '').trim() || undefined };
}
async function parseWorkerFile(file: File): Promise<WorkerImportRow[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('O ficheiro não pode ultrapassar 5 MB.');
  if (file.name.toLowerCase().endsWith('.csv')) {
    const parsed = Papa.parse<Record<string, unknown>>(await file.text(), { header: true, skipEmptyLines: true, dynamicTyping: false });
    if (parsed.errors.length) throw new Error(`Erro a ler CSV: ${parsed.errors[0].message}`);
    return parsed.data.map(rowToWorker).filter((row): row is WorkerImportRow => Boolean(row));
  }
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('Escolha um ficheiro Excel (.xlsx/.xls) ou CSV.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('O ficheiro Excel não contém folhas com dados.');
  const values: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => values.push((row.values as unknown[]).slice(1)));
  if (values.length < 2) throw new Error('O ficheiro precisa de cabeçalho e pelo menos uma linha de trabalhador.');
  const keys = values[0].map((key) => String(key ?? ''));
  return values.slice(1).map((line) => Object.fromEntries(keys.map((key, index) => [key, line[index]]))).map(rowToWorker).filter((row): row is WorkerImportRow => Boolean(row));
}
function downloadCredentials(credentials: WorkerCredential[]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = ['Nome,Utilizador,Cargo,Palavra-passe', ...credentials.map((row) => [row.full_name, row.username, row.title, row.password].map(escape).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `credenciais-equipa-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
}

function WorkersAdminPage() {
  const { data, error, loading, refresh } = useResource<{ workers: Worker[] }>('/admin/workers');
  const [fileRows, setFileRows] = useState<WorkerImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [credentials, setCredentials] = useState<WorkerCredential[]>([]);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);
  const [title, setTitle] = useState('');
  const [titleWorking, setTitleWorking] = useState(false);
  const [titleNotice, setTitleNotice] = useState('');
  const [singleName, setSingleName] = useState('');
  const [singleTitle, setSingleTitle] = useState('');
  const [singleWorking, setSingleWorking] = useState(false);
  const parseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setFormError(''); setSuccess(''); setCredentials([]); setFileRows([]); setFileName(file.name);
    try { const rows = await parseWorkerFile(file); if (!rows.length) throw new Error('Não encontrei nomes. Use um cabeçalho “Nome” e, se necessário, “Cargo”.'); if (rows.length > 500) throw new Error('O limite por importação é 500 trabalhadores.'); setFileRows(rows); }
    catch (problem) { setFormError(problem instanceof Error ? problem.message : 'Não foi possível ler o ficheiro.'); }
    event.target.value = '';
  };
  const importRows = async () => {
    setImporting(true); setFormError(''); setSuccess(''); setCredentials([]);
    try { const result = await apiPost<{ created: WorkerCredential[]; count: number }>('/admin/workers/import', { workers: fileRows }); setCredentials(result.created); setSuccess(`${result.count} conta${result.count === 1 ? '' : 's'} criada${result.count === 1 ? '' : 's'}. As palavras-passe são apresentadas uma única vez.`); setFileRows([]); refresh(); }
    catch (problem) { setFormError(problem instanceof Error ? problem.message : 'A importação falhou.'); }
    finally { setImporting(false); }
  };
  const createSingleWorker = async (event: FormEvent) => {
    event.preventDefault(); setSingleWorking(true); setFormError(''); setSuccess(''); setCredentials([]);
    try {
      const result = await apiPost<{ worker: Worker; password: string }>('/admin/workers', { full_name: singleName.trim(), title: singleTitle.trim() || undefined });
      setCredentials([{ full_name: result.worker.full_name, username: result.worker.username, password: result.password, title: result.worker.title ?? '' }]);
      setSuccess('Conta criada. A palavra-passe inicial só é apresentada agora; entregue as credenciais por um canal seguro.');
      setSingleName(''); setSingleTitle(''); refresh();
    } catch (problem) { setFormError(problem instanceof Error ? problem.message : 'Não foi possível criar a conta.'); }
    finally { setSingleWorking(false); }
  };
  const createTitle = async (event: FormEvent) => { event.preventDefault(); if (!title.trim()) return; setTitleWorking(true); setTitleNotice(''); try { await apiPost('/admin/worker-titles', { title: title.trim() }); setTitle(''); setTitleNotice('Cargo criado.'); } catch (problem) { setTitleNotice(problem instanceof Error ? problem.message : 'Não foi possível criar o cargo.'); } finally { setTitleWorking(false); } };
  return <>
    <PageHeading eyebrow="Gestão da equipa" title="Trabalhadores" description="Crie contas individualmente por importação Excel/CSV. As contas só recebem acesso às obras que lhes atribuir." />
    <section className="panel-card single-worker-panel"><div className="panel-heading"><div><span className="panel-kicker">CRIAR INDIVIDUALMENTE</span><h2>Adicionar trabalhador</h2></div><UserRound size={18} /></div><form className="stack-form" onSubmit={createSingleWorker}><label>Nome completo<input value={singleName} onChange={(event) => setSingleName(event.target.value)} minLength={2} maxLength={120} required placeholder="Nome do trabalhador" /></label><label>Cargo (opcional)<input value={singleTitle} onChange={(event) => setSingleTitle(event.target.value)} maxLength={80} placeholder="Ex.: Encarregado de obra" /></label><button className="button-primary" disabled={singleWorking}>{singleWorking ? 'A criar conta…' : 'Criar conta individual'}<ArrowRight size={16} /></button></form></section>
    <div className="worker-admin-grid"><section className="panel-card import-panel"><div className="panel-heading"><div><span className="panel-kicker">IMPORTAÇÃO EM LOTE</span><h2>Adicionar trabalhadores</h2></div><Upload size={18} /></div><p>Carregue uma folha com cabeçalhos <strong>Nome</strong> e, opcionalmente, <strong>Cargo</strong>. Cada conta recebe um utilizador e uma palavra-passe forte, únicos.</p><label className="upload-zone"><input type="file" accept=".xlsx,.xls,.csv" onChange={parseFile} /><span className="upload-icon"><FilePlus2 size={20} /></span><strong>{fileName || 'Selecionar ficheiro'}</strong><small>Excel ou CSV · máximo 5 MB · até 500 linhas</small><span className="upload-button">Procurar ficheiro</span></label>{formError && <div className="inline-notice error-notice">{formError}</div>}{success && <div className="inline-notice success-notice"><CheckCircle2 size={16} />{success}</div>}
      {fileRows.length > 0 && <div className="import-preview"><div className="preview-heading"><strong>Pré-visualização · {fileRows.length} registos</strong><span>Sem contas criadas ainda</span></div><div className="preview-list">{fileRows.slice(0, 5).map((row, i) => <div key={`${row.full_name}-${i}`}><span>{row.full_name}</span><small>{row.title || 'Cargo por atribuir'}</small></div>)}{fileRows.length > 5 && <span className="preview-more">+ {fileRows.length - 5} restantes</span>}</div><button className="button-primary" onClick={importRows} disabled={importing}>{importing ? 'A criar contas…' : `Criar ${fileRows.length} conta${fileRows.length === 1 ? '' : 's'}`}<ArrowRight size={16} /></button></div>}
      {credentials.length > 0 && <div className="credential-panel"><div className="credential-warning"><ShieldCheck size={19} /><div><strong>Credenciais de acesso</strong><span>Guarde-as agora num local seguro. Por segurança, não poderão ser consultadas novamente.</span></div></div><div className="credential-table"><div className="credential-head"><span>Trabalhador</span><span>Utilizador</span><span>Palavra-passe inicial</span></div>{credentials.map((item) => <div className="credential-row" key={item.username}><span>{item.full_name}</span><code>{item.username}</code><code>{item.password}</code></div>)}</div><button className="button-secondary" onClick={() => downloadCredentials(credentials)}><ArrowDownToLine size={16} />Descarregar ficheiro seguro</button></div>}
    </section><section className="panel-card title-panel"><div className="panel-heading"><div><span className="panel-kicker">CARGOS CONFIGURÁVEIS</span><h2>Criar cargo</h2></div><BriefcaseBusiness size={18} /></div><p>Adicione designações de função para organizar a equipa.</p><form className="compact-form" onSubmit={createTitle}><label>Nome do cargo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Encarregado de obra" /></label><button className="button-secondary" disabled={titleWorking}><Plus size={15} />Criar cargo</button></form>{titleNotice && <div className="form-note">{titleNotice}</div>}<div className="role-note"><CircleHelp size={15} /><span>Os cargos descrevem a função. As permissões são sempre as do portal de trabalhador.</span></div></section></div>
    <section className="panel-card table-panel"><div className="panel-heading"><div><span className="panel-kicker">CONTAS ATUAIS</span><h2>Equipa Obragoito</h2></div><button className="icon-button" onClick={refresh} aria-label="Atualizar lista"><Activity size={16} /></button></div><DataState loading={loading} error={error} empty={!loading && !error && (data?.workers.length ?? 0) === 0}><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Nome</th><th>Utilizador</th><th>Cargo</th><th>Estado</th></tr></thead><tbody>{data?.workers.map((worker) => <tr key={worker.id}><td><span className="table-person"><span className="table-avatar">{worker.full_name.slice(0, 1).toUpperCase()}</span>{worker.full_name}</span></td><td><code>{worker.username}</code></td><td>{worker.title || '—'}</td><td><span className={`state-pill ${worker.enabled ? 'state-active' : 'state-disabled'}`}><i />{worker.enabled ? 'Ativo' : 'Inativo'}</span></td></tr>)}</tbody></table></div></DataState></section>
  </>;
}

function ClientsAdminPage() {
  const { data, error, loading, refresh } = useResource<{ clients: Client[] }>('/admin/clients');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [notice, setNotice] = useState(''); const [credential, setCredential] = useState<{ username: string; password: string } | null>(null); const [working, setWorking] = useState(false);
  const create = async (event: FormEvent) => { event.preventDefault(); setWorking(true); setNotice(''); setCredential(null); try { const result = await apiPost<{ client: Client; password: string }>('/admin/clients', { full_name: name.trim(), email: email.trim() }); setCredential({ username: result.client.username, password: result.password }); setNotice('Conta criada. Entregue a palavra-passe ao cliente por um canal seguro.'); setName(''); setEmail(''); refresh(); } catch (problem) { setNotice(problem instanceof Error ? problem.message : 'Não foi possível criar o cliente.'); } finally { setWorking(false); } };
  return <><PageHeading eyebrow="Contas de cliente" title="Clientes" description="Crie e gira os acessos dos clientes. Cada cliente vê exclusivamente as obras que lhe são atribuídas e as atualizações que publicar." /><div className="two-column-content"><section className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">NOVA CONTA</span><h2>Adicionar cliente</h2></div><UserRound size={18} /></div><form className="stack-form" onSubmit={create}><label>Nome completo<input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Nome do cliente" /></label><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="cliente@empresa.pt" /></label><button className="button-primary" disabled={working}>{working ? 'A criar conta…' : 'Criar acesso'}<ArrowRight size={16} /></button></form>{notice && <div className="form-note">{notice}</div>}{credential && <div className="credential-warning client-credential"><ShieldCheck size={18} /><div><strong>Utilizador: {credential.username}</strong><span>Palavra-passe inicial: <code>{credential.password}</code></span></div></div>}</section><section className="panel-card account-guide"><span className="panel-kicker">ACESSO CONTROLADO</span><h2>Como funciona</h2><div className="guide-step"><span>01</span><p>Crie a conta com o email do cliente.</p></div><div className="guide-step"><span>02</span><p>Atribua-lhe as obras na página <Link to="/obras">Obras</Link>.</p></div><div className="guide-step"><span>03</span><p>Publique atualizações para aparecerem no portal do cliente.</p></div></section></div><section className="panel-card table-panel"><div className="panel-heading"><div><span className="panel-kicker">CONTAS CRIADAS</span><h2>Lista de clientes</h2></div><button className="icon-button" onClick={refresh} aria-label="Atualizar lista"><Activity size={16} /></button></div><DataState loading={loading} error={error} empty={!loading && !error && (data?.clients.length ?? 0) === 0}><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Cliente</th><th>Utilizador</th><th>Estado</th></tr></thead><tbody>{data?.clients.map((client) => <tr key={client.id}><td>{client.full_name}</td><td><code>{client.username}</code></td><td><span className={`state-pill ${client.enabled ? 'state-active' : 'state-disabled'}`}><i />{client.enabled ? 'Ativo' : 'Inativo'}</span></td></tr>)}</tbody></table></div></DataState></section></>;
}

function AdminProjectsPage() {
  const { data, error, loading, refresh } = useResource<{ projects: Project[] }>('/admin/projects');
  const { data: clientsData } = useResource<{ clients: Client[] }>('/admin/clients');
  const { data: workersData } = useResource<{ workers: Worker[] }>('/admin/workers');
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [clientId, setClientId] = useState(''); const [workerIds, setWorkerIds] = useState<string[]>([]); const [notice, setNotice] = useState(''); const [working, setWorking] = useState(false);
  const [updateTarget, setUpdateTarget] = useState(''); const [updateTitle, setUpdateTitle] = useState(''); const [updateBody, setUpdateBody] = useState(''); const [updateNotice, setUpdateNotice] = useState('');
  const createProject = async (event: FormEvent) => { event.preventDefault(); setWorking(true); setNotice(''); try { await apiPost('/admin/projects', { name: name.trim(), description: description.trim() || null, client_id: clientId || null, worker_ids: workerIds }); setName(''); setDescription(''); setClientId(''); setWorkerIds([]); setNotice('Obra criada e atribuições guardadas.'); refresh(); } catch (problem) { setNotice(problem instanceof Error ? problem.message : 'Não foi possível criar a obra.'); } finally { setWorking(false); } };
  const publishUpdate = async (event: FormEvent) => { event.preventDefault(); if (!updateTarget) return; setUpdateNotice(''); try { await apiPost(`/admin/projects/${updateTarget}/updates`, { title: updateTitle.trim(), body: updateBody.trim() }); setUpdateTitle(''); setUpdateBody(''); setUpdateNotice('Atualização publicada no portal do cliente.'); } catch (problem) { setUpdateNotice(problem instanceof Error ? problem.message : 'Não foi possível publicar.'); } };
  const toggleWorker = (id: string) => setWorkerIds((old) => old.includes(id) ? old.filter((value) => value !== id) : [...old, id]);
  return <><PageHeading eyebrow="Gestão de projetos" title="Obras" description="Crie obras, atribua cada uma a clientes e trabalhadores e publique atualizações para o cliente quando estiverem prontas." /><div className="two-column-content"><section className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">NOVA OBRA</span><h2>Criar e atribuir</h2></div><FolderKanban size={18} /></div><form className="stack-form" onSubmit={createProject}><label>Nome da obra<input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Nome usado no portal" /></label><label>Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Descrição interna ou visível ao cliente" /></label><label>Cliente<select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Sem cliente atribuído</option>{clientsData?.clients.map((client) => <option value={client.id} key={client.id}>{client.full_name}</option>)}</select></label><fieldset className="worker-assignment"><legend>Trabalhadores atribuídos</legend>{(workersData?.workers ?? []).length === 0 ? <span className="hint-text">Adicione trabalhadores para os poder atribuir.</span> : workersData?.workers.map((worker) => <label key={worker.id} className="checkbox-row"><input type="checkbox" checked={workerIds.includes(worker.id)} onChange={() => toggleWorker(worker.id)} />{worker.full_name}</label>)}</fieldset><button className="button-primary" disabled={working}>{working ? 'A guardar…' : 'Criar obra'}<ArrowRight size={16} /></button></form>{notice && <div className="form-note">{notice}</div>}</section><section className="panel-card publish-guide"><span className="panel-kicker">PORTAL DO CLIENTE</span><h2>Publicar só o que está pronto.</h2><p>Os trabalhadores enviam notas internas à administração. A equipa de gestão decide o que se torna uma atualização visível ao cliente.</p><div className="permission-note"><ShieldCheck size={18} /><span>Trabalhadores não podem publicar atualizações de cliente.</span></div></section></div><section className="panel-card table-panel"><div className="panel-heading"><div><span className="panel-kicker">OBRAS REGISTADAS</span><h2>Lista de obras</h2></div><button className="icon-button" onClick={refresh} aria-label="Atualizar obras"><Activity size={16} /></button></div><DataState loading={loading} error={error} empty={!loading && !error && (data?.projects.length ?? 0) === 0}><div className="project-admin-list">{data?.projects.map((project) => <article className="project-admin-card" key={project.id}><div className="project-admin-info"><span className={`project-status status-${project.status}`}>{project.status === 'active' ? 'Em curso' : project.status === 'completed' ? 'Concluída' : project.status === 'draft' ? 'Rascunho' : 'Arquivada'}</span><h3>{project.name}</h3><p>{project.description || 'Sem descrição.'}</p></div><form className="publish-update-form" onSubmit={publishUpdate}><strong>Atualização ao cliente</strong><input value={updateTarget === project.id ? updateTitle : ''} onFocus={() => setUpdateTarget(project.id)} onChange={(event) => { setUpdateTarget(project.id); setUpdateTitle(event.target.value); }} placeholder="Título da atualização" /><textarea value={updateTarget === project.id ? updateBody : ''} onFocus={() => setUpdateTarget(project.id)} onChange={(event) => { setUpdateTarget(project.id); setUpdateBody(event.target.value); }} placeholder="Mensagem que o cliente poderá ver" rows={2} /><button className="button-secondary" type="submit" disabled={updateTarget !== project.id || !updateTitle.trim() || !updateBody.trim()}><ArrowUpRight size={14} />Publicar no portal</button></form></article>)}</div></DataState>{updateNotice && <div className="form-note">{updateNotice}</div>}</section></>;
}

function InternalMessagesPage() {
  const { data, error, loading, refresh } = useResource<{ messages: InternalMessage[] }>('/admin/internal');
  const { data: workersData } = useResource<{ workers: Worker[] }>('/admin/workers');
  const { data: projectsData } = useResource<{ projects: Project[] }>('/admin/projects');
  const [workerId, setWorkerId] = useState(''); const [projectId, setProjectId] = useState(''); const [body, setBody] = useState(''); const [notice, setNotice] = useState(''); const [working, setWorking] = useState(false);
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (!workerId || !projectId || !body.trim()) return;
    setWorking(true); setNotice('');
    try { await apiPost('/admin/messages', { worker_id: workerId, project_id: projectId, body: body.trim() }); setBody(''); setNotice('Mensagem privada enviada ao trabalhador.'); refresh(); }
    catch (problem) { setNotice(problem instanceof Error ? problem.message : 'Não foi possível enviar a mensagem.'); }
    finally { setWorking(false); }
  };
  return <><PageHeading eyebrow="Comunicação interna" title="Comunicações" description="Converse em privado com os trabalhadores e reveja os relatórios da equipa. Nada é publicado no portal dos clientes." action={<button className="icon-button" onClick={refresh} aria-label="Atualizar comunicações"><Activity size={16} /></button>} />
    <section className="panel-card admin-message-compose"><div className="panel-heading"><div><span className="panel-kicker">MENSAGEM PRIVADA</span><h2>Falar com um trabalhador</h2></div><MessageSquareText size={18} /></div>
      <form className="stack-form" onSubmit={send}><div className="message-target-grid"><label>Trabalhador<select value={workerId} onChange={(event) => setWorkerId(event.target.value)} required><option value="">Escolher trabalhador</option>{workersData?.workers.filter((worker) => worker.enabled).map((worker) => <option value={worker.id} key={worker.id}>{worker.full_name}</option>)}</select></label><label>Obra atribuída<select value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Escolher obra</option>{projectsData?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label></div>
        <VoiceTextarea label="Mensagem" value={body} onChange={setBody} placeholder="Escreva ou dite uma mensagem privada para a equipa" rows={4} required />
        <button className="button-primary" disabled={working || !workerId || !projectId || !body.trim()}>{working ? 'A enviar…' : 'Enviar ao trabalhador'}<ArrowRight size={16} /></button>{notice && <div className="form-note">{notice}</div>}
      </form><div className="role-note"><ShieldCheck size={15} /><span>O envio só é permitido quando o trabalhador está atribuído à obra escolhida.</span></div>
    </section>
    <section className="panel-card table-panel"><div className="panel-heading"><div><span className="panel-kicker">INTERNAS</span><h2>Mensagens e relatórios</h2></div><MessageSquareText size={18} /></div><DataState loading={loading} error={error} empty={!loading && !error && (data?.messages.length ?? 0) === 0}><div className="internal-list">{data?.messages.map((message) => <article className="internal-message" key={message.id}><div className="internal-message-icon">{message.type === 'report' ? <ClipboardList size={17} /> : <MessageSquareText size={17} />}</div><div className="internal-message-body"><div className="internal-message-meta"><strong>{message.from_admin ? `Administração → ${message.recipient_name || 'Trabalhador'}` : message.sender_name || 'Trabalhador'}</strong><span>{message.type === 'report' ? 'Relatório de progresso' : message.from_admin ? 'Mensagem enviada' : 'Mensagem recebida'}</span><time>{message.created_at ? new Date(message.created_at).toLocaleString('pt-PT') : ''}</time></div><p>{message.body}</p><small>Obra: {message.project_name || '—'}</small></div></article>)}</div></DataState></section>
  </>;
}

function DocumentsAdminPage() {
  const { data, error, loading, refresh } = useResource<{ documents: PortalDocument[] }>('/admin/documents');
  const { data: projectsData } = useResource<{ projects: Project[] }>('/admin/projects');
  const [projectId, setProjectId] = useState(''); const [audience, setAudience] = useState('client'); const [file, setFile] = useState<File | null>(null); const [notice, setNotice] = useState(''); const [working, setWorking] = useState(false);
  const upload = async (event: FormEvent) => { event.preventDefault(); if (!file || !projectId) return; if (file.size > UPLOAD_LIMIT_MB * 1024 * 1024) { setNotice(`O ficheiro excede o limite de ${UPLOAD_LIMIT_MB} MB.`); return; } setWorking(true); setNotice(''); const form = new FormData(); form.set('file', file); form.set('project_id', projectId); form.set('audience', audience); try { await api('/admin/documents', { method: 'POST', body: form }); setFile(null); setNotice('Documento carregado e partilhado com o público escolhido.'); refresh(); } catch (problem) { setNotice(problem instanceof Error ? problem.message : 'Não foi possível carregar o documento.'); } finally { setWorking(false); } };
  return <><PageHeading eyebrow="Documentos de obra" title="Documentos" description="Carregue documentos para uma obra e escolha se ficam apenas para a administração, para a equipa ou para o cliente." /><div className="two-column-content"><section className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">NOVO FICHEIRO</span><h2>Partilhar documento</h2></div><FilePlus2 size={18} /></div><form className="stack-form" onSubmit={upload}><label>Obra<select value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Escolher obra</option>{projectsData?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Disponível para<select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="client">Cliente da obra</option><option value="workers">Trabalhadores atribuídos</option><option value="admin_only">Só administração</option></select></label><label className="file-input-label">Ficheiro<input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /><span>{file?.name ?? 'Selecionar ficheiro'}</span></label><button className="button-primary" disabled={working || !file || !projectId}>{working ? 'A carregar…' : 'Carregar documento'}<Upload size={15} /></button></form>{notice && <div className="form-note">{notice}</div>}</section><section className="panel-card document-guide"><span className="panel-kicker">ARMAZENAMENTO</span><h2>Acesso limitado à obra.</h2><p>Os ficheiros ficam num bucket privado do Supabase. O cliente só recebe um link temporário depois de a aplicação confirmar a sua atribuição e a audiência do documento.</p><div className="permission-note"><ShieldCheck size={18} /><span>Links de ficheiro temporários e não indexados.</span></div></section></div><section className="panel-card table-panel"><div className="panel-heading"><div><span className="panel-kicker">FICHEIROS</span><h2>Documentos carregados</h2></div><button className="icon-button" onClick={refresh} aria-label="Atualizar documentos"><Activity size={16} /></button></div><DataState loading={loading} error={error} empty={!loading && !error && (data?.documents.length ?? 0) === 0}><div className="document-list">{data?.documents.map((doc) => <div className="document-row" key={doc.id}><span className="document-icon"><FileText size={18} /></span><span className="document-title"><strong>{doc.file_name}</strong><small>{doc.project_name || 'Obra'} · {doc.audience === 'client' ? 'Cliente' : doc.audience === 'workers' ? 'Equipa' : 'Administração'}</small></span><time>{new Date(doc.created_at).toLocaleDateString('pt-PT')}</time></div>)}</div></DataState></section></>;
}

function ClientHome() {
  const { data, error, loading } = useResource<{ projects: Project[] }>('/client/projects');
  const projects = data?.projects ?? [];
  return <><PageHeading eyebrow="Área do cliente" title="Acompanhe a sua obra." description="Consulte apenas os projetos que a administração lhe atribuiu e as atualizações que decidiu partilhar consigo." /><div className="client-welcome-panel"><div className="client-welcome-copy"><span className="panel-kicker">PORTAL DE CLIENTES</span><h2>Informação da sua obra,<br /><em>num só lugar.</em></h2><p>Atualizações e documentos partilhados pela equipa Obragoito.</p></div><div className="client-welcome-icon"><Building2 size={36} strokeWidth={1.2} /></div></div><div className="section-title-row"><div><span className="panel-kicker">ATRIBUÍDAS À SUA CONTA</span><h2>As minhas obras</h2></div><Link to="/obras" className="subtle-link">Ver todas <ArrowRight size={15} /></Link></div><DataState loading={loading} error={error} empty={!loading && !error && projects.length === 0}><ProjectCards projects={projects} base="/obras" /></DataState></>;
}

function ProjectCards({ projects, base }: { projects: Project[]; base: string }) {
  return <div className="project-card-grid">{projects.map((project) => <Link className="portal-project-card" to={`${base}/${project.id}`} key={project.id}><div className="project-card-top"><span className={`project-status status-${project.status}`}>{project.status === 'active' ? 'Em curso' : project.status === 'completed' ? 'Concluída' : project.status === 'draft' ? 'Rascunho' : 'Arquivada'}</span><ArrowUpRight size={16} /></div><h3>{project.name}</h3><p>{project.description || 'A administração ainda não adicionou uma descrição.'}</p><span className="card-link-label">Abrir obra <ArrowRight size={14} /></span></Link>)}</div>;
}

function ClientProjectsPage() {
  const { data, error, loading } = useResource<{ projects: Project[] }>('/client/projects');
  return <><PageHeading eyebrow="Obras atribuídas" title="As minhas obras" description="A informação visível nesta área corresponde apenas a obras atribuídas à sua conta." /><DataState loading={loading} error={error} empty={!loading && !error && (data?.projects.length ?? 0) === 0}><ProjectCards projects={data?.projects ?? []} base="/obras" /></DataState></>;
}

function ProjectDetailPage({ kind }: { kind: 'client' | 'worker' }) {
  const { id = '' } = useParams();
  const endpoint = kind === 'client' ? `/client/projects/${encodeURIComponent(id)}` : `/worker/projects/${encodeURIComponent(id)}`;
  const { data, error, loading } = useResource<{ project: Project; updates?: ProjectUpdate[] }> (endpoint);
  const project = data?.project;
  return <><Link to="/obras" className="back-link"><ArrowLeft size={15} />Voltar às obras</Link><DataState loading={loading} error={error} empty={!loading && !error && !project}><div className="project-detail-view"><PageHeading eyebrow={kind === 'client' ? 'Detalhe da obra' : 'Obra atribuída'} title={project?.name ?? ''} description={project?.description || 'A administração ainda não adicionou uma descrição.'} /><span className={`project-status status-${project?.status}`}>{project?.status === 'active' ? 'Em curso' : project?.status === 'completed' ? 'Concluída' : project?.status === 'draft' ? 'Rascunho' : 'Arquivada'}</span>{kind === 'client' && <section className="panel-card updates-card"><div className="panel-heading"><div><span className="panel-kicker">INFORMAÇÃO PARTILHADA</span><h2>Atualizações</h2></div><Activity size={18} /></div>{(data?.updates ?? []).length === 0 ? <div className="empty-inline">Ainda não há atualizações partilhadas para esta obra.</div> : data?.updates?.map((item) => <article className="client-update" key={item.id}><time>{item.published_at ? new Date(item.published_at).toLocaleDateString('pt-PT') : ''}</time><h3>{item.title}</h3><p>{item.body}</p></article>)}</section>}</div></DataState></>;
}

function ClientDocumentsPage() {
  const { data, error, loading } = useResource<{ documents: PortalDocument[] }>('/client/documents');
  const [notice, setNotice] = useState('');
  const download = async (id: string) => { setNotice(''); try { const result = await apiPost<{ url: string }>(`/documents/${id}/download`, {}); window.open(result.url, '_blank', 'noopener,noreferrer'); } catch (problem) { setNotice(problem instanceof Error ? problem.message : 'Não foi possível abrir o documento.'); } };
  return <><PageHeading eyebrow="Ficheiros partilhados" title="Documentos" description="Documentos que a Obragoito disponibilizou para as suas obras." />{notice && <div className="form-note">{notice}</div>}<section className="panel-card table-panel"><div className="panel-heading"><div><span className="panel-kicker">ACESSO PRIVADO</span><h2>Os seus documentos</h2></div><FileText size={18} /></div><DataState loading={loading} error={error} empty={!loading && !error && (data?.documents.length ?? 0) === 0}><div className="document-list">{data?.documents.map((doc) => <div className="document-row" key={doc.id}><span className="document-icon"><FileText size={18} /></span><span className="document-title"><strong>{doc.file_name}</strong><small>{doc.project_name || 'Obra'} · {new Date(doc.created_at).toLocaleDateString('pt-PT')}</small></span><button className="icon-button" onClick={() => download(doc.id)} aria-label={`Descarregar ${doc.file_name}`}><ArrowDownToLine size={17} /></button></div>)}</div></DataState></section></>;
}

function WorkerHome() {
  const { data, error, loading } = useResource<{ projects: Project[] }>('/worker/projects');
  return <><PageHeading eyebrow="Área de equipa" title="Bom trabalho." description="Consulte as obras que lhe foram atribuídas e envie relatórios ou mensagens diretamente à administração." /><div className="worker-callout"><span className="worker-callout-icon"><HardHat size={24} /></span><div><strong>Comunicação direta com a administração</strong><span>As suas mensagens e relatórios são internos. Não são publicados no portal de clientes.</span></div><Link to="/comunicacoes"><ArrowUpRight size={18} /></Link></div><div className="section-title-row"><div><span className="panel-kicker">ACESSO ATRIBUÍDO PELO ADMIN</span><h2>Obras em que participa</h2></div><Link to="/obras" className="subtle-link">Ver todas <ArrowRight size={15} /></Link></div><DataState loading={loading} error={error} empty={!loading && !error && (data?.projects.length ?? 0) === 0}><ProjectCards projects={data?.projects ?? []} base="/obras" /></DataState></>;
}

function WorkerProjectsPage() {
  const { data, error, loading } = useResource<{ projects: Project[] }>('/worker/projects');
  return <><PageHeading eyebrow="Obras atribuídas" title="A minha equipa de obra" description="As obras disponíveis são atribuídas à sua conta pela administração." /><DataState loading={loading} error={error} empty={!loading && !error && (data?.projects.length ?? 0) === 0}><ProjectCards projects={data?.projects ?? []} base="/obras" /></DataState></>;
}

function WorkerCommunicationsPage() {
  const { data: projectsData } = useResource<{ projects: Project[] }>('/worker/projects');
  const { data, error, loading, refresh } = useResource<{ messages: InternalMessage[] }>('/worker/messages');
  const [projectId, setProjectId] = useState(''); const [message, setMessage] = useState(''); const [report, setReport] = useState(''); const [notice, setNotice] = useState(''); const [working, setWorking] = useState(false);
  const send = async (type: 'message' | 'report', event: FormEvent) => { event.preventDefault(); const body = type === 'message' ? message.trim() : report.trim(); if (!projectId || !body) return; setWorking(true); setNotice(''); try { await apiPost(type === 'message' ? '/worker/messages' : '/worker/reports', { project_id: projectId, body }); if (type === 'message') setMessage(''); else setReport(''); setNotice(type === 'message' ? 'Mensagem enviada à administração.' : 'Relatório enviado à administração.'); refresh(); } catch (problem) { setNotice(problem instanceof Error ? problem.message : 'Não foi possível enviar.'); } finally { setWorking(false); } };
  return <><PageHeading eyebrow="Comunicação interna" title="Fale com a administração" description="Envie mensagens e atualizações de progresso sobre uma obra atribuída. A administração também pode responder aqui; o cliente não vê estas comunicações." /><section className="panel-card communication-form"><div className="panel-heading"><div><span className="panel-kicker">OBRA ASSOCIADA</span><h2>Nova comunicação</h2></div><MessageSquareText size={18} /></div><label>Escolher obra<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Selecionar</option>{projectsData?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><div className="communication-two-forms"><form className="stack-form" onSubmit={(event) => send('message', event)}><VoiceTextarea label="Mensagem para a administração" value={message} onChange={setMessage} rows={4} placeholder="Escreva ou dite uma mensagem privada" /><button className="button-secondary" disabled={working || !projectId || !message.trim()}><MessageSquareText size={15} />Enviar mensagem</button></form><form className="stack-form" onSubmit={(event) => send('report', event)}><VoiceTextarea label="Relatório de progresso" value={report} onChange={setReport} rows={4} placeholder="Descreva o progresso, uma necessidade ou uma ocorrência" /><button className="button-primary" disabled={working || !projectId || !report.trim()}><ClipboardList size={15} />Enviar relatório</button></form></div>{notice && <div className="form-note">{notice}</div>}</section><section className="panel-card table-panel"><div className="panel-heading"><div><span className="panel-kicker">HISTÓRICO PESSOAL</span><h2>As minhas comunicações</h2></div><button className="icon-button" onClick={refresh} aria-label="Atualizar mensagens"><Activity size={16} /></button></div><DataState loading={loading} error={error} empty={!loading && !error && (data?.messages.length ?? 0) === 0}><div className="internal-list">{data?.messages.map((item) => <article className={`internal-message ${item.from_admin ? 'message-from-admin' : ''}`} key={item.id}><div className="internal-message-icon"><MessageSquareText size={17} /></div><div className="internal-message-body"><div className="internal-message-meta"><strong>{item.type === 'report' ? 'Relatório enviado' : item.from_admin ? 'Resposta da administração' : 'Mensagem enviada à administração'}</strong><time>{item.created_at ? new Date(item.created_at).toLocaleString('pt-PT') : ''}</time></div><p>{item.body}</p><small>Obra: {item.project_name || '—'}</small></div></article>)}</div></DataState></section></>;
}

export function PortalApp({ kind }: { kind: PortalKind }) {
  const { user, loading, setupError, error, signIn, signOut, changeInitialPassword } = usePortalSession();
  const location = useLocation();
  const meta = kindConfig[kind];
  useEffect(() => { document.title = `${meta.title} — Obragoito`; }, [meta.title]);
  if (loading) return <div className="portal-loading"><span className="loading-spinner" /><span>A preparar o portal…</span></div>;
  if (!user) return <LoginScreen kind={kind} onLogin={signIn} setupError={setupError} initialError={error} />;
  if (user.password_change_required) return <InitialPasswordScreen kind={kind} fullName={user.full_name} onChange={changeInitialPassword} onLogout={signOut} />;
  if (!user.enabled || user.role !== meta.expectedRole) return <main className="access-denied"><BrandMark dark /><div className="access-denied-card"><ShieldCheck size={27} /><h1>Acesso não autorizado</h1><p>Esta conta não tem permissões para esta área. Cada portal tem credenciais e permissões próprias.</p><button className="button-secondary" onClick={signOut}>Terminar sessão</button></div></main>;
  return <PortalAppFrame kind={kind} user={user} onLogout={signOut}><AnimatePresence mode="wait"><motion.div key={location.pathname} className="portal-page-motion" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .18 }}><Routes>
    <Route path="/" element={kind === 'admin' ? <AdminHome /> : kind === 'clients' ? <ClientHome /> : <WorkerHome />} />
    {kind === 'admin' && <>
      <Route path="/obras" element={<AdminProjectsPage />} /><Route path="/clientes" element={<ClientsAdminPage />} /><Route path="/trabalhadores" element={<WorkersAdminPage />} /><Route path="/mensagens" element={<InternalMessagesPage />} /><Route path="/documentos" element={<DocumentsAdminPage />} />
    </>}
    {kind === 'clients' && <><Route path="/obras" element={<ClientProjectsPage />} /><Route path="/obras/:id" element={<ProjectDetailPage kind="client" />} /><Route path="/documentos" element={<ClientDocumentsPage />} /></>}
    {kind === 'workers' && <><Route path="/obras" element={<WorkerProjectsPage />} /><Route path="/obras/:id" element={<ProjectDetailPage kind="worker" />} /><Route path="/comunicacoes" element={<WorkerCommunicationsPage />} /></>}
    <Route path="*" element={<section className="panel-card"><h2>Esta área ainda não está disponível.</h2><Link className="subtle-link" to="/">Voltar ao início <ArrowRight size={15} /></Link></section>} />
  </Routes></motion.div></AnimatePresence></PortalAppFrame>;
}
