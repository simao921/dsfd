import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  Construction,
  Facebook,
  Instagram,
  Landmark,
  Mail,
  MapPin,
  Menu,
  MoveUpRight,
  Phone,
  Ruler,
  ShieldCheck,
  X,
} from 'lucide-react';

type Project = { title: string; image: string; number: string; summary: string };

const projects: Project[] = [
  { title: 'Praça Nuno Gonçalves', image: '/images/praca-nuno-goncalves.jpg', number: '01', summary: 'Projeto apresentado no portefólio público da Obragoito.' },
  { title: 'Parque Infantil Freeport', image: '/images/parque-infantil-freeport.jpg', number: '02', summary: 'Projeto apresentado no portefólio público da Obragoito.' },
  { title: 'Praça Duque de Saldanha', image: '/images/praca-duque-saldanha.jpg', number: '03', summary: 'Projeto apresentado no portefólio público da Obragoito.' },
  { title: 'Monumento à Agricultura', image: '/images/monumento-agricultura.jpg', number: '04', summary: 'Projeto apresentado no portefólio público da Obragoito.' },
  { title: 'Rotunda de Benfica', image: '/images/rotunda-benfica.jpg', number: '05', summary: 'Projeto apresentado no portefólio público da Obragoito.' },
  { title: 'Homenagem aos profissionais da Covid', image: '/images/monumento-covid.jpg', number: '06', summary: 'Projeto apresentado no portefólio público da Obragoito.' },
];

const services = [
  { number: '01', title: 'Infraestruturas', text: 'Projetos de construção pública, desde praças a parques infantis.', icon: Construction },
  { number: '02', title: 'Urbanismo', text: 'Intervenções e reestruturação de espaços públicos.', icon: Landmark },
  { number: '03', title: 'Reabilitação', text: 'Construção e reabilitação de edifícios empresariais e habitacionais.', icon: Ruler },
  { number: '04', title: 'Empreendimentos', text: 'Loteamentos e empreendimentos que dão lugar a novos bairros.', icon: Building2 },
];

const nav = [
  { to: '/servicos', label: 'Serviços' },
  { to: '/projetos', label: 'Obras' },
  { to: '/sobre', label: 'A Obragoito' },
  { to: '/contactos', label: 'Contactos' },
];

function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="Obragoito — início">
      <span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span>
      <span className="brand-word">OBRAGOITO<span className="brand-dot">.</span></span>
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <header className={`site-header ${open ? 'nav-open' : ''}`}>
      <div className="header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Navegação principal">
          {nav.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>{item.label}</NavLink>)}
        </nav>
        <Link className="header-cta" to="/contactos"><span>Fale connosco</span><ArrowUpRight size={16} /></Link>
        <button className="menu-toggle" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <AnimatePresence>
        {open && <motion.nav className="mobile-nav" aria-label="Navegação móvel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
          {nav.map((item, i) => <motion.div key={item.to} initial={{ x: 14, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.04 }}><NavLink to={item.to}>{item.label}<ArrowUpRight size={16} /></NavLink></motion.div>)}
          <Link className="mobile-contact" to="/contactos">Fale connosco <ArrowUpRight size={16} /></Link>
        </motion.nav>}
      </AnimatePresence>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-brand-block">
          <Brand light />
          <p>Construções e Obras Públicas.<br />Rigor em cada detalhe.</p>
        </div>
        <div className="footer-nav-block"><span className="eyebrow">Explorar</span>{nav.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}</div>
        <div className="footer-nav-block"><span className="eyebrow">Contactos</span><a href="tel:+351219605500">21 960 5500</a><a href="mailto:obragoito@obragoito.pt">obragoito@obragoito.pt</a><span>Quinta do Almargem<br />2705-570 São João das Lampas</span></div>
        <div className="footer-nav-block"><span className="eyebrow">Redes sociais</span><a href="https://www.facebook.com/share/1E2jEP8KoM/" target="_blank" rel="noreferrer">Facebook <ArrowUpRight size={13} /></a><a href="https://www.instagram.com/obragoito?dlrf=N29mdG4wZ2N1cnNt" target="_blank" rel="noreferrer">Instagram <ArrowUpRight size={13} /></a></div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} Obragoito — Construções e Obras Públicas, Lda.</span><span>Feito com rigor, como a obra.</span></div>
    </footer>
  );
}

function ArrowLink({ to, children, light = false }: { to: string; children: React.ReactNode; light?: boolean }) {
  return <Link className={`arrow-link ${light ? 'arrow-link-light' : ''}`} to={to}><span>{children}</span><span className="arrow-circle"><ArrowUpRight size={16} /></span></Link>;
}

function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <div className={`eyebrow ${dark ? 'eyebrow-dark' : ''}`}><span className="eyebrow-mark" />{children}</div>;
}

function HomePage() {
  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const imageY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 82]);
  return (
    <main>
      <section className="hero" ref={heroRef}>
        <motion.div className="hero-image-wrap" style={{ y: imageY }}>
          <img src="/images/parque-infantil-freeport.jpg" alt="Parque Infantil Freeport, obra do portefólio Obragoito" fetchPriority="high" />
        </motion.div>
        <div className="hero-overlay" />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <Eyebrow>Construções &amp; Obras Públicas · Portugal</Eyebrow>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.12 }}>
            Construímos<br /><em>espaços</em> que ficam.
          </motion.h1>
          <motion.div className="hero-bottom" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.3 }}>
            <p>Construção civil e obras públicas.<br />Mais de 35 anos de experiência em Portugal.</p>
            <Link to="/projetos" className="hero-cta"><span>Ver obras realizadas</span><ArrowDownRight size={19} /></Link>
          </motion.div>
        </div>
        <div className="hero-index"><span>01</span><i /><small>OBRA FEITA</small></div>
        <div className="hero-caption"><span>PORTFÓLIO</span><span>PARQUE INFANTIL FREEPORT</span></div>
        <motion.div className="hero-stamp" animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 38, repeat: Infinity, ease: 'linear' }} aria-label="35 anos de experiência">
          <svg viewBox="0 0 130 130" aria-hidden="true"><defs><path id="stamp-circle" d="M65,65 m-48,0 a48,48 0 1,1 96,0 a48,48 0 1,1 -96,0" /></defs><text><textPath href="#stamp-circle">OBRA FEITA COM RIGOR · DESDE 1991 · </textPath></text></svg>
          <span>35<small>+</small></span>
        </motion.div>
        <Link className="hero-scroll" to="/projetos"><span>Deslize para explorar</span><span className="scroll-line" /></Link>
      </section>

      <div className="service-ticker" aria-label="Áreas de atuação"><div className="ticker-track">{[0, 1].map((loop) => <div className="ticker-set" key={loop} aria-hidden={loop === 1}>{services.map((service) => <span key={`${loop}-${service.number}`}>{service.title}<i /></span>)}</div>)}</div></div>

      <section className="intro section-pad">
        <div className="intro-side"><Eyebrow>01 / Quem somos</Eyebrow><span className="intro-line" /><span className="micro-label">A NOSSA EXPERIÊNCIA</span></div>
        <div className="intro-main">
          <h2>Há mais de três décadas a dar <em>forma ao que importa.</em></h2>
          <div className="intro-bottom"><p>Criada em 1991, a Obragoito constrói e reabilita com experiência, competência técnica e compromisso com a qualidade — de pequenas intervenções a grandes empreendimentos.</p><ArrowLink to="/sobre">Conheça a Obragoito</ArrowLink></div>
        </div>
        <div className="intro-stat"><strong>35<span>+</span></strong><small>ANOS DE EXPERIÊNCIA</small></div>
      </section>

      <section className="works-section section-pad">
        <div className="section-heading"><div><Eyebrow>02 / Obra feita</Eyebrow><h2>Projetos que <em>ficam.</em></h2></div><ArrowLink to="/projetos">Explorar portefólio</ArrowLink></div>
        <div className="featured-projects">
          <Link to="/projetos" className="project-card project-card-large">
            <div className="project-image"><img src={projects[0].image} alt={projects[0].title} loading="lazy" /><span className="project-open"><ArrowUpRight size={19} /></span></div>
            <div className="project-meta"><span className="project-number">{projects[0].number} / ESPAÇO PÚBLICO</span><h3>{projects[0].title}</h3></div>
          </Link>
          <Link to="/projetos" className="project-card project-card-offset">
            <div className="project-image"><img src={projects[2].image} alt={projects[2].title} loading="lazy" /><span className="project-open"><ArrowUpRight size={19} /></span></div>
            <div className="project-meta"><span className="project-number">{projects[2].number} / OBRA PÚBLICA</span><h3>{projects[2].title}</h3></div>
          </Link>
          <Link to="/projetos" className="project-card project-card-third">
            <div className="project-image"><img src={projects[4].image} alt={projects[4].title} loading="lazy" /><span className="project-open"><ArrowUpRight size={19} /></span></div>
            <div className="project-meta"><span className="project-number">{projects[4].number} / URBANISMO</span><h3>{projects[4].title}</h3></div>
          </Link>
        </div>
      </section>

      <section className="numbers-band">
        <div className="numbers-label"><Eyebrow dark>03 / Experiência</Eyebrow><p>Conhecimento construído<br />ao longo do tempo.</p></div>
        <div className="number-item"><strong>35<span>+</span></strong><small>ANOS NO MERCADO<br />NACIONAL</small></div>
        <div className="number-divider" />
        <div className="number-item"><strong>250<span>+</span></strong><small>OBRAS REALIZADAS<br />AO LONGO DA NOSSA HISTÓRIA</small></div>
        <div className="numbers-stamp"><ShieldCheck size={29} strokeWidth={1.2} /><span>QUALIDADE<br />E COMPETÊNCIA</span></div>
      </section>

      <section className="services-section section-pad">
        <div className="section-heading"><div><Eyebrow>04 / O que fazemos</Eyebrow><h2>Construção com <em>visão.</em></h2></div><ArrowLink to="/servicos">Ver áreas de negócio</ArrowLink></div>
        <div className="services-list">{services.map((service) => <Link to="/servicos" className="service-row" key={service.number}><span className="service-no">{service.number}</span><service.icon className="service-icon" size={25} strokeWidth={1.35} /><div className="service-copy"><h3>{service.title}</h3><p>{service.text}</p></div><span className="service-arrow"><ArrowUpRight size={18} /></span></Link>)}</div>
      </section>

      <section className="quote-section">
        <div className="quote-image"><img src="/images/rotunda-benfica.jpg" alt="Rotunda de Benfica, projeto do portefólio Obragoito" loading="lazy" /></div>
        <div className="quote-content"><Eyebrow>05 / Compromisso</Eyebrow><blockquote>“A qualidade está no que se vê. E, sobretudo, no que <em>fica.</em>”</blockquote><Link to="/sobre" className="text-link">O nosso compromisso <ArrowUpRight size={15} /></Link></div>
      </section>

      <section className="contact-strip section-pad"><div><Eyebrow>06 / Próximo projeto</Eyebrow><h2>Vamos construir<br /><em>o próximo.</em></h2></div><ArrowLink to="/contactos">Fale connosco</ArrowLink><div className="contact-decoration" aria-hidden="true">OG</div></section>
    </main>
  );
}

function ProjectsPage() {
  const [selected, setSelected] = useState<Project | null>(null);
  useEffect(() => { document.title = 'Projetos — Obragoito'; }, []);
  return (
    <main className="inner-page projects-page">
      <section className="page-hero section-pad"><Eyebrow>Portefólio / 2026</Eyebrow><h1>Obra feita.<br /><em>Memória construída.</em></h1><p>Uma seleção de projetos publicados pela Obragoito nas diferentes áreas de atuação.</p></section>
      <section className="portfolio-grid section-pad" aria-label="Projetos Obragoito">{projects.map((project, index) => <button type="button" className={`portfolio-card portfolio-card-${index + 1}`} key={project.number} onClick={() => setSelected(project)}><span className="portfolio-image"><img src={project.image} alt={project.title} loading="lazy" /><span className="portfolio-open"><MoveUpRight size={18} /></span></span><span className="portfolio-meta"><small>{project.number} / OBRAGOITO</small><strong>{project.title}</strong></span></button>)}</section>
      <section className="next-project section-pad"><Eyebrow>Tem um projeto em mente?</Eyebrow><h2>O próximo projeto<br />pode ser <em>o seu.</em></h2><ArrowLink to="/contactos">Pedir contacto</ArrowLink></section>
      <AnimatePresence>{selected && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelected(null)}><motion.div className="project-modal" initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={selected.title}><button className="modal-close" onClick={() => setSelected(null)} aria-label="Fechar"><X size={20} /></button><img src={selected.image} alt={selected.title} /><div className="modal-copy"><span className="eyebrow">{selected.number} / Portefólio Obragoito</span><h2>{selected.title}</h2><p>{selected.summary}</p><ArrowLink to="/contactos">Falar sobre um projeto</ArrowLink></div></motion.div></motion.div>}</AnimatePresence>
    </main>
  );
}

function ServicesPage() {
  useEffect(() => { document.title = 'Serviços — Obragoito'; }, []);
  return <main className="inner-page services-page"><section className="page-hero section-pad"><Eyebrow>Áreas de negócio</Eyebrow><h1>Competência<br />para <em>construir.</em></h1><p>Uma experiência abrangente no ramo da construção civil e das obras públicas.</p></section><section className="service-detail-list section-pad">{services.map((service) => <article className="service-detail" key={service.number}><div className="service-detail-top"><span>{service.number}</span><service.icon size={26} strokeWidth={1.35} /></div><h2>{service.title}</h2><p>{service.text}</p><div className="service-detail-rule" /></article>)}</section><section className="service-note section-pad"><div className="service-note-icon"><Check size={23} /></div><div><span className="eyebrow">Do planeamento à obra</span><h2>Rigor técnico.<br /><em>Compromisso real.</em></h2></div><p>Ao longo dos anos, a Obragoito tem executado projetos de diferentes dimensões com foco na qualidade e competência técnica.</p></section><section className="next-project section-pad"><Eyebrow>Tem um projeto em mente?</Eyebrow><h2>Vamos conversar<br />sobre <em>o que vem aí.</em></h2><ArrowLink to="/contactos">Fale connosco</ArrowLink></section></main>;
}

function AboutPage() {
  useEffect(() => { document.title = 'Sobre nós — Obragoito'; }, []);
  return <main className="inner-page about-page"><section className="page-hero section-pad"><Eyebrow>Desde 1991</Eyebrow><h1>Experiência que<br /><em>se constrói.</em></h1><p>Construções e obras públicas com compromisso, rigor e excelência.</p></section><section className="about-story section-pad"><div className="about-image"><img src="/images/monumento-agricultura.jpg" alt="Monumento à Agricultura, obra do portefólio Obragoito" loading="lazy" /><span>OBRA FEITA / PORTFÓLIO</span></div><div className="about-copy"><Eyebrow>01 / Quem somos</Eyebrow><h2>Mais de 35 anos a construir <em>o futuro.</em></h2><p>Criada em 1991, a Obragoito tornou-se uma empresa de referência no setor da construção civil, especializada em soluções de qualidade para obras públicas e privadas.</p><p>Ao longo do seu percurso, realizou mais de 250 obras — de pequenas intervenções a empreendimentos de maior dimensão. O compromisso com a qualidade e a competência técnica orienta cada projeto.</p><div className="about-signature"><strong>Obragoito</strong><span>CONSTRUÇÕES E OBRAS PÚBLICAS, LDA.</span></div></div></section><section className="about-values section-pad"><div><Eyebrow>02 / O nosso compromisso</Eyebrow><h2>Trabalho sério.<br /><em>Obra que perdura.</em></h2></div><div className="value-list"><article><span>01</span><div><h3>Qualidade</h3><p>O rigor e a qualidade como base de cada obra.</p></div></article><article><span>02</span><div><h3>Competência técnica</h3><p>Experiência acumulada em diferentes áreas da construção.</p></div></article><article><span>03</span><div><h3>Compromisso</h3><p>Responsabilidade em cada etapa, da intervenção à entrega.</p></div></article></div></section><section className="next-project section-pad"><Eyebrow>Vamos construir juntos</Eyebrow><h2>Uma boa obra<br />começa com uma <em>conversa.</em></h2><ArrowLink to="/contactos">Contactar a Obragoito</ArrowLink></section></main>;
}

function ContactPage() {
  useEffect(() => { document.title = 'Contactos — Obragoito'; }, []);
  return <main className="inner-page contact-page"><section className="page-hero section-pad"><Eyebrow>Estamos disponíveis</Eyebrow><h1>Vamos falar<br />do seu <em>projeto.</em></h1><p>Entre em contacto com a equipa da Obragoito. Teremos todo o gosto em avaliar a sua ideia.</p></section><section className="contact-grid section-pad"><a className="contact-card contact-card-primary" href="tel:+351219605500"><span className="contact-card-icon"><Phone size={20} /></span><small>CONTACTO</small><strong>21 960 5500</strong><span>Telefone <ArrowUpRight size={15} /></span></a><a className="contact-card" href="mailto:obragoito@obragoito.pt"><span className="contact-card-icon"><Mail size={20} /></span><small>EMAIL</small><strong>obragoito@obragoito.pt</strong><span>Enviar mensagem <ArrowUpRight size={15} /></span></a><div className="contact-card contact-address"><span className="contact-card-icon"><MapPin size={20} /></span><small>SEDE</small><strong>Quinta do Almargem<br />Chilreira, 2705-570<br />São João das Lampas</strong><a href="https://maps.google.com/?q=Quinta+do+Almargem+Chilreira+2705-570+S%C3%A3o+Jo%C3%A3o+das+Lampas" target="_blank" rel="noreferrer">Ver localização <ArrowUpRight size={15} /></a></div><div className="contact-social-card"><Eyebrow>Também nas redes</Eyebrow><p>Acompanhe os projetos e novidades da Obragoito.</p><div><a href="https://www.facebook.com/share/1E2jEP8KoM/" target="_blank" rel="noreferrer"><Facebook size={18} />Facebook<ArrowUpRight size={15} /></a><a href="https://www.instagram.com/obragoito?dlrf=N29mdG4wZ2N1cnNt" target="_blank" rel="noreferrer"><Instagram size={18} />Instagram<ArrowUpRight size={15} /></a></div></div></section><section className="contact-bottom section-pad"><span>OBRAGOITO · CONSTRUÇÕES E OBRAS PÚBLICAS, LDA.</span><span>Quinta do Almargem, São João das Lampas</span></section></main>;
}

function NotFound() {
  return <main className="not-found"><Eyebrow>404 / Página não encontrada</Eyebrow><h1>Esta página<br /><em>não existe.</em></h1><ArrowLink to="/">Voltar ao início</ArrowLink></main>;
}

export default function PublicSite() {
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [location.pathname]);
  return <div className="public-site"><Header /><AnimatePresence mode="wait"><Routes location={location} key={location.pathname}><Route path="/" element={<HomePage />} /><Route path="/home" element={<HomePage />} /><Route path="/servicos" element={<ServicesPage />} /><Route path="/projetos" element={<ProjectsPage />} /><Route path="/sobre" element={<AboutPage />} /><Route path="/contactos" element={<ContactPage />} /><Route path="*" element={<NotFound />} /></Routes></AnimatePresence><Footer /></div>;
}
