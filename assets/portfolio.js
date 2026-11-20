// 포트폴리오 페이지(index.html) — 아래로 읽는 한 페이지 + A4 인쇄(제출 PDF)
//   순서(에디토리얼 · 2026-11-18 이 저장소에서 고침 — /portfolio-update 뒤 다시 넣기, 작업메모 참고):
//     머리(큰 제목 en.hero · 연락처 목록) → 대표 프로젝트(화면만, 세로 스크롤·휠·화살표로 좌우 넘김) → 핵심 기능(화면만) → 소개(자기소개 + 기술 스택, 2026-11-20 핵심 기능 뒤로)
//     → 프로젝트마다 소개 + 기능 소개 → 한눈에 보기(인쇄만) → 연락처(이메일을 누르면 메시지 칸이 펼쳐짐, Web3Forms)
//   기능 소개: 화면(그 기능 절의 이미지 highlights[].image만)은 왼쪽에 모으고, 기능 설명과 [슬라이드 열기]는 오른쪽 목록에 한 열로 맞춤
//   모든 글은 data/portfolio.json·data/projects/*.json 값 그대로입니다. 절 이름·버튼 같은 UI 문구는 문구 표(PF.t, assets/strings.js + theme/strings.tsv)에서 옵니다.
//   주소: #<절 id>(cover · intro · stack · p-<폴더> · p-<폴더>-core · glance · contact). 예전 포트폴리오 슬라이드 주소(#s=<장면 id> · #<번호>)는 같은 절로 넘깁니다.
//   점검: PFPage.whenReady() → PFPage.report() · ?pf-audit=1이면 #pf-audit에 report()의 base64 JSON(headless용, 슬라이드와 같은 형식)
(() => {
  const root = document.getElementById('app');
  const html = document.documentElement;
  const { esc, inline, isUrl, shortUrl, link, t } = PF;
  const T = (k, v) => esc(t(k, v));                                    // HTML에 넣는 문구
  const pad2 = (n) => String(n).padStart(2, '0');
  const info = { errors: [], sections: [], projects: 0 };
  html.dataset.pfReady = 'no';
  // 처음 주소로 도착한 절, 또는 새로고침 전 스크롤 위치. 글꼴·그림이 늦게 와 위치가 밀리면 settle()에서 한 번 더 맞춤(그사이 사용자가 움직이지 않았을 때만)
  let arrived = '', restoreY = null, userMoved = false;
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => addEventListener(t, () => { userMoved = true; }, { once: true, passive: true }));
  const POS = `pf-portfolio-y:${location.pathname}`;                 // 새로고침해도 읽던 곳으로(내용을 늦게 그려 브라우저가 스스로 되돌리지 못함)
  try { history.scrollRestoration = 'manual'; } catch { /* 그대로 */ }
  addEventListener('pagehide', () => { try { sessionStorage.setItem(POS, String(Math.round(scrollY))); } catch { /* 저장소 막힘 */ } });
  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });
  window.PFPage = { whenReady: () => ready, report };

  start().catch((err) => {
    info.errors.push(String(err && err.stack || err));
    PF.notice(root, '페이지를 그리지 못했습니다', `<p>${esc(err && err.message || err)}</p>`);
  }).finally(settle);

  async function start() {
    if (PF.guardFileProtocol(root)) { info.errors.push('file:// — 로컬 서버로 열어야 합니다'); return; }
    let pf;
    const strings = PF.loadStrings();                                   // 실패해도 기본 문구(던지지 않음)
    try { pf = await PF.loadJSON('data/portfolio.json'); }
    catch (err) { info.errors.push(`data/portfolio.json: ${err && err.message || err}`); PF.noData(root, err); return; }
    PF.applyTheme(pf.settings?.accent);
    const projects = (await Promise.all((pf.projects || []).map((id) => PF.loadJSON(`data/projects/${encodeURIComponent(id)}.json`)
      .catch((err) => {                                                 // 그 프로젝트만 빼고 그리되, 점검(report().errors)에는 남김 — 조용히 사라지지 않게
        console.warn('[portfolio] 프로젝트 데이터 없음:', err.message);
        info.errors.push(`data/projects/${id}.json: ${err && err.message || err}`);
        return null;
      })))).filter(Boolean);
    await strings;
    render(pf, projects);
    bind();
    arrived = go(projects);                                            // 내용을 그린 뒤라 브라우저가 처음 주소의 절로 스스로 가지 못함
    if (!arrived && performance.getEntriesByType?.('navigation')[0]?.type === 'reload') {
      try { restoreY = +sessionStorage.getItem(POS) || null; } catch { /* 저장소 막힘 */ }
      if (restoreY) scrollTo({ top: restoreY, behavior: 'instant' });
    }
    addEventListener('hashchange', () => go(projects));                // 같은 페이지에서 예전 주소(#s=…)를 붙여 넣은 경우
  }

  // 화면에서 숨긴(인쇄 전용) 프로젝트 절로 가려는 주소 → 같은 내용이 있는 곳으로: #p-<폴더> = 대표 프로젝트의 그 장, #p-<폴더>-core = 핵심 기능의 그 탭
  let workCtl = null, tabsCtl = null, projIds = [];
  function redirect(id) {
    const m = /^p-(.+?)(-core)?$/.exec(id || '');
    const el = document.getElementById(id);
    if (!m || !el || el.offsetHeight > 0) return false;
    const i = projIds.indexOf(m[1]);
    if (i < 0) return false;
    if (m[2] && tabsCtl) {
      const tab = [...root.querySelectorAll('.kf-tab')].findIndex((b) => b.textContent === document.querySelector(`#${CSS.escape(id)} h2`)?.textContent);
      if (tab >= 0) tabsCtl.pick(tab);
      root.querySelector('#features')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    } else {
      if (narrowView.matches || !workCtl) root.querySelector('#work')?.scrollIntoView({ behavior: 'instant', block: 'start' });
      workCtl?.go(i, true);                                            // 넓은 화면: 그 장의 세로 위치로 · 좁은 화면: 트랙을 그 장으로
    }
    return true;
  }

  function go(projects) {
    const want = legacyTarget(projects);
    const el = want && document.getElementById(want);
    if (!el) return '';
    if (redirect(want)) return want;
    if (location.hash !== `#${encodeURIComponent(want)}`) try { history.replaceState(null, '', `${location.pathname}${location.search}#${encodeURIComponent(want)}`); } catch { /* 그대로 */ }
    el.scrollIntoView({ behavior: 'instant', block: 'start' });        // 부드러운 스크롤은 가려진 창에서 멈춤 → 바로 이동
    return want;
  }

  // 예전 포트폴리오 슬라이드의 주소(#s=<장면 id> · #<번호> · #s-<번호> · 옛 랜딩 #skills 등) → 이 페이지의 절 id. 지금 주소가 절 id 그대로여도 돌려줌(그리고 나서 그 절로 스크롤)
  //   번호는 실제로 그린 절의 차례(예전 슬라이드도 그린 장면만 셈. 나뉜 장면 stack-2·glance-2는 이제 한 절). #0·#-3 → 첫 절, #99 → 마지막 절(슬라이드 키트와 같은 규칙)
  function legacyTarget(projects) {
    let h = location.hash.slice(1);
    try { h = decodeURIComponent(h); } catch { /* 그대로 */ }
    if (!h) return '';
    const nth = (n) => info.sections[Math.max(1, Math.min(info.sections.length, n)) - 1] || '';
    if (/^-?\d+$/.test(h)) return nth(+h);
    const m = /^s=(.+)$/.exec(h);
    if (m) h = m[1].replace(/^(stack|glance)-\d+$/, '$1');
    const sn = /^s-(\d+)$/.exec(h);
    if (sn) return nth(+sn[1]);
    return { skills: 'stack', projects: projects[0] ? `p-${projects[0].id}` : '', summary: 'glance' }[h] ?? h;
  }

  function render(pf, projects) {
    const prof = pf.profile || {};
    const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
    const nameT = prof.name || t('name.portfolio');
    document.title = `${prof.name ? prof.name + ' · ' : ''}${t('name.portfolio')}`;
    document.querySelector('.skip-link')?.replaceChildren(t('ui.skip'));
    const total = pad2(projects.length);
    const btn = (href, label, kind, cls = 'btn') => link({ href, label, kind, cls });
    const profLinks = (prof.links || []).filter((l) => isUrl(l.url));
    // 인쇄(PDF)에서는 버튼 대신 칠 수 있는 주소를 보여 줌. rows: [이름, 보이는 주소, 링크, 종류] — PDF에서는 눌러도 열림(링크 규칙은 PF.link 그대로, ↗는 인쇄에서 숨김)
    const printUrls = (rows) => rows.length ? `<dl class="print-only purls">${rows.map(([k, u, href, kind]) => `<div><dt>${esc(k)}</dt><dd class="url">${href
      ? link({ href, label: esc(u), kind }) : esc(u)}</dd></div>`).join('')}</dl>` : '';
    const sec = (id, eyebrow, title, right, body, cls = '') => `<section id="${esc(id)}" class="sec${cls ? ' ' + cls : ''}"><div class="wrap">
      <div class="sec-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2></div>${right ? `<p class="sec-r">${esc(right)}</p>` : ''}</div>${body}</div></section>`;
    const out = [];

    // ① 머리: 큰 제목(문구 표 en.hero — 비우면 이름) · 오른쪽 연락처 목록(이메일은 맨 아래 메시지 칸을 펼침)
    const heroT = t('en.hero').trim() || nameT;
    const hc = [prof.email && `<li><button type="button" class="hc-row" data-open-msg><span>${esc(prof.email)}</span><span class="k">${T('en.contact')}</span></button></li>`,
      isUrl(prof.github) && `<li>${link({ href: prof.github, label: '<span>GitHub</span>', kind: 'external', cls: 'hc-row' })}</li>`,
      ...profLinks.map((l) => `<li>${link({ href: l.url, label: `<span>${esc(l.label)}</span>`, kind: 'external', cls: 'hc-row' })}</li>`)].filter(Boolean);
    out.push(`<section id="cover" class="hero"><div class="wrap">
      <div class="hero-top"><p class="eyebrow">${T('en.portfolio')} · ${esc(nameT)}</p>${pf.generatedAt ? `<p class="upd">${T('page.updated', { date: pf.generatedAt })}</p>` : ''}</div>
      <div class="hero-g"><div class="hero-t"><h1${heroT !== nameT ? ' lang="en"' : ''}>${esc(heroT)}</h1>${prof.headline ? `<p class="headline">${esc(prof.headline)}</p>` : ''}</div>${hc.length ? `<ul class="hero-ct no-print">${hc.join('')}</ul>` : ''}</div>
      ${printUrls([prof.email && [t('page.print-email'), prof.email, `mailto:${prof.email}`, 'mail'], isUrl(prof.github) && ['GitHub', shortUrl(prof.github), prof.github, 'external'],
        ...profLinks.map((l) => [l.label, shortUrl(l.url), l.url, 'external']), [t('page.print-web'), PF.visibleUrl('')]].filter(Boolean))}
    </div></section>`);

    // ② 대표 프로젝트(화면만): 세로 스크롤·휠·화살표로 좌우로 넘김. 인쇄에서는 아래 프로젝트 절이 대표 이미지까지 보여 줌
    if (projects.length) out.push(work(projects, total));

    // ③ 핵심 기능(화면): 프로젝트 탭 + 기능 카드(그림은 비율 그대로). 한 화면 한 절 — 대표 프로젝트 바로 뒤에 이어 봄
    const kf = keyFeatures(projects);
    if (kf) out.push(kf);

    // ④ 소개(핵심 기능 뒤 — 자기소개·기술 스택이 앞에서 본 기능을 근거로 정리): 자기소개(profile.intro를 줄바꿈까지 그대로) + 기술 스택(기술마다 evidence와 근거 프로젝트)
    const aboutB = prof.intro ? `<div class="ab-row"><p class="ab-k">${T('page.intro')}</p><div class="about">${prof.intro.split(/\n+/).filter((l) => l.trim()).map((l) => `<p>${inline(l)}</p>`).join('')}</div></div>` : '';
    const stackB = (pf.skills || []).length ? `<div class="ab-row" id="stack"><div class="ab-k"><p>${T('page.stack')}</p><p class="ab-note">${T('page.stack-note')}</p></div><ul class="skills">${pf.skills.map((s) => `<li class="skill">
      <h3>${esc(s.name)}</h3><ul>${(s.evidence || []).map((e) => `<li><span>${inline(e.text)}</span>${byId[e.project] ? link({ href: `#p-${e.project}`, label: esc(byId[e.project].title), kind: 'anchor', cls: 'chip' }) : ''}</li>`).join('')}</ul></li>`).join('')}</ul></div>` : '';
    if (aboutB || stackB) out.push(sec('intro', t('en.about'), t('page.about'), '', `<div class="ab-grid">${aboutB}${stackB}</div>`));

    // ⑤ 프로젝트마다 소개 + 기능 소개 — 제출 PDF에만(화면에서는 ② 대표 프로젝트 · ④ 핵심 기능이 같은 역할, 자세한 글은 슬라이드·상세 문서)
    projects.forEach((p, j) => {
      const no = t('page.project-no', { no: pad2(j + 1), total });
      out.push(projectIntro(p, no, sec, btn, printUrls));
      const fe = features(p, no, sec, btn);
      if (fe) out.push(fe);
    });

    // ⑤ 한눈에 보기(format/01 §1 프로젝트 요약 표) — 제출 PDF에만(화면에서는 위의 대표 프로젝트가 같은 역할)
    if (projects.length) out.push(sec('glance', t('en.glance'), t('page.glance'), '',`<ul class="glance">${projects.map((p) => `<li>
      <div class="g-t">${link({ href: `#p-${p.id}`, label: esc(p.title), kind: 'anchor' })}<p>${esc(PF.teamLabel(p.team))}</p></div>
      <div class="g-b">${p.tagline ? `<p>${inline(p.tagline)}</p>` : ''}${(p.tags || []).length ? `<p class="g-tags">${esc(p.tags.slice(0, 4).join(' · '))}</p>` : ''}
        ${p.team?.role ? `<p class="g-role"><b>${T('name.role-short')}</b> ${inline(p.team.role)}</p>` : ''}</div>
      <div class="g-l">${projLinks(p)}</div></li>`).join('')}</ul>`, 'print-only'));

    // ⑥ 연락처: 화면은 큰 이메일 → 누르면 아래로 메시지 칸이 펼쳐짐(Web3Forms로 전달). 인쇄는 연락처 + 프로젝트별 링크
    out.push(`<footer id="contact" class="sec contact"><div class="wrap">
      <p class="eyebrow">${T('en.contact')}</p>
      ${prof.email ? `<div class="no-print">${contactForm(prof.email)}</div>` : ''}
      <div class="ct print-only">
        <div class="ct-me"><p class="ct-name">${esc(nameT)}</p>
          ${prof.email ? `<p class="em">${link({ href: `mailto:${prof.email}`, label: esc(prof.email), kind: 'mail' })}</p>` : ''}
          ${isUrl(prof.github) ? `<p>${link({ href: prof.github, label: `<span class="url">${esc(shortUrl(prof.github))}</span>` })}</p>` : ''}
          ${profLinks.map((l) => `<p><span class="k">${esc(l.label)}</span> ${link({ href: l.url, label: `<span class="url">${esc(shortUrl(l.url))}</span>` })}</p>`).join('')}
          <p class="print-only"><span class="url">${esc(PF.visibleUrl(''))}</span></p></div>
        <div class="ct-lk">${projects.map((p) => `<div><b>${esc(p.title)}</b><span class="row">${projLinks(p)}</span>${(p.links?.extra || []).filter((l) => isUrl(l.url))
          .map((l) => `<span class="ex">${esc(l.label)} ${link({ href: l.url, label: `<span class="url">${esc(shortUrl(l.url))}</span>` })}</span>`).join('')}</div>`).join('')}</div>
      </div></div></footer>`);

    const nav = [['work', t('page.nav-projects'), projects.length], ['features', t('page.nav-features'), kf], ['intro', t('page.nav-intro'), aboutB || stackB],
      ['contact', t('page.nav-contact'), true]].filter((x) => x[0] && x[2]);
    root.innerHTML = `<header class="top no-print"><div class="wrap top-in">
        <a class="top-name" href="#cover">${esc(nameT)}</a>
        <nav aria-label="절 이동"><ul>${nav.map(([id, label]) => `<li><a href="#${esc(id)}">${esc(label)}</a></li>`).join('')}</ul></nav>
        <button type="button" class="btn primary pdf" data-pdf>${T('ui.pdf')}</button>${PF.modeButton()}</div></header>
      <main id="main">${out.join('')}</main>`;
    root.querySelectorAll('img').forEach((i) => { if (!i.hasAttribute('loading')) i.loading = 'lazy'; i.decoding = 'async'; });
    info.sections = [...root.querySelectorAll('main > section[id], main > footer[id]')].map((s) => s.id);
    info.projects = projects.length;
    projIds = projects.map((p) => p.id);
  }

  // (직접 고침 11/20) 대표 프로젝트 칸만 움직이는 대표 그림: 대표 이미지 옆의 cover-motion.webp(_local/cover-motion.py로 만듦)를 보여 주고,
  //   (지연 로딩은 페이지가 모든 img에 이미 걸어 둠) 그 파일이 없으면 대표 이미지로 돌아감. '동작 줄이기'를 켠 사람에게는 처음부터 대표 이미지. 상세 문서·슬라이드·인쇄는 대표 이미지 그대로
  function coverMotion(p) {
    const still = PF.srcPath(p.id, p.cover);
    const motion = PF.srcPath(p.id, p.cover.replace(/[^/]*$/, 'cover-motion.webp'));
    return `<picture style="display:contents"><source media="(prefers-reduced-motion: reduce)" srcset="${esc(still)}"><img src="${esc(motion)}" alt="" onerror="this.onerror=null;this.previousElementSibling.remove();this.src='${esc(still)}'"></picture>`;
  }

  // 대표 프로젝트: 한 장에 한 프로젝트(대표 이미지 — 모두 같은 높이, 비율이 다르면 잘라 냄 · 제목 · 소개 · 내 역할 · 기술 · 링크)
  function work(projects, total) {
    const slide = (p, i) => {
      const L = p.links || {};
      const links = [link({ href: PF.projectUrl(p.id), label: T('name.deck'), kind: 'page', cls: 'wl main' }), link({ href: PF.docUrl(p.id), label: T('name.doc'), kind: 'page', cls: 'wl main' }),
        isUrl(L.video) && link({ href: L.video, label: T('name.video'), kind: 'external', cls: 'wl main' }), isUrl(L.github) && link({ href: L.github, label: 'GitHub', kind: 'external', cls: 'wl main' })].filter(Boolean);
      return `<article class="slide" aria-roledescription="slide" aria-label="${i + 1} / ${projects.length} · ${esc(p.title)}"><div class="wrap">
        ${p.cover ? `<a class="w-shot" href="${esc(PF.docUrl(p.id))}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${coverMotion(p)}</a>`
          : '<div class="w-shot empty" aria-hidden="true"></div>'}
        <div class="w-info">
          <h3>${link({ href: PF.projectUrl(p.id), label: esc(p.title), kind: 'page' })}</h3>
          <dl class="w-cols">
            <div class="w-col"><dt class="w-kind">${pad2(i + 1)} · ${esc(PF.teamLabel(p.team))}</dt><dd class="w-tag">${p.tagline ? inline(p.tagline) : ''}</dd></div>
            <div class="w-col"><dt>${p.team?.role ? T('name.role') : ''}</dt><dd class="w-role">${p.team?.role ? inline(p.team.role) : ''}</dd></div>
            <div class="w-col"><dt>${(p.tags || []).length ? T('en.skills') : ''}</dt><dd class="w-tags">${esc((p.tags || []).join(' / '))}</dd></div>
          </dl>
          <div class="w-links">${links.join('')}</div>
        </div></div></article>`;
    };
    return `<section id="work" class="work no-print" aria-roledescription="carousel" aria-label="${T('page.work')}"><div class="w-frame">
      <div class="wrap"><div class="sec-head"><div><p class="eyebrow">${T('en.work')}</p><h2>${T('page.work')}</h2></div><p class="w-count" aria-live="polite"><b data-w-cur>01</b> / ${total}</p></div></div>
      <div class="w-view"><div class="w-track">${projects.map(slide).join('')}</div>
        ${projects.length > 1 ? `<button type="button" class="w-arrow prev" data-w-prev aria-label="${T('page.prev-project')}" title="${T('page.prev-project')}">&lt;</button>
        <button type="button" class="w-arrow next" data-w-next aria-label="${T('page.next-project')}" title="${T('page.next-project')}">&gt;</button>` : ''}</div>
    </div></section>`;
  }

  // 메시지 칸: 정적 페이지는 메일을 직접 못 보내 Web3Forms를 거침(받는 주소 = access key를 만들 때 넣은 이메일. 이 키는 페이지에 공개해도 되는 값)
  //   항목 이름은 영문(한글 항목 이름은 받은 메일에서 깨짐). 적힌 내용은 한글 그대로
  function contactForm(email) {
    return `<button type="button" class="ct-big" data-msg-toggle aria-expanded="false" aria-controls="msg">${esc(email)}</button>
      <div class="reveal" id="msg" inert><div class="reveal-in">
        <form class="msg" novalidate aria-labelledby="msg-title">
          <div class="msg-h"><h2 id="msg-title">${T('page.msg-title')}</h2><button type="button" class="msg-x" data-msg-close aria-label="${T('ui.close')}">×</button></div>
          <div class="msg-2"><label>${T('page.msg-name')}<input name="name" required maxlength="80" autocomplete="name" placeholder="${T('page.msg-name-ph')}"></label>
            <label>${T('page.msg-contact')}<input name="contact" required maxlength="120" autocomplete="email" placeholder="${T('page.msg-contact-ph')}"></label></div>
          <label>${T('page.msg-body')}<textarea name="message" required maxlength="4000" placeholder="${T('page.msg-body-ph')}"></textarea></label>
          <input class="msg-hp" type="checkbox" name="botcheck" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="msg-f"><p class="msg-st" role="status" aria-live="polite"></p><button class="msg-send" type="submit">${T('page.msg-send')}</button></div>
        </form></div></div>`;
  }

  // 프로젝트 소개: 대표 이미지(인쇄만 — 화면은 위 대표 프로젝트에 있음) · 메타(장르·기간·인원·환경) · 내 역할 · 개발 의도 · 태그 · 링크
  function projectIntro(p, no, sec, btn, printUrls) {
    const meta = (p.meta || []).map((m) => `<div><dt>${esc(m.label)}</dt><dd>${inline(m.value)}</dd></div>`);
    if (p.team?.role) meta.push(`<div class="wide"><dt>${T('name.role')}</dt><dd>${inline(p.team.role)}</dd></div>`);
    const extra = (p.links?.extra || []).filter((l) => isUrl(l.url));
    const btns = [btn(PF.projectUrl(p.id), T('name.deck'), 'page', 'btn primary'), btn(PF.docUrl(p.id), T('name.doc'), 'page'),
      isUrl(p.links?.github) && btn(p.links.github, 'GitHub', 'external'), isUrl(p.links?.video) && btn(p.links.video, T('name.video'), 'external'),
      ...extra.map((l) => btn(l.url, esc(l.label), 'external'))].filter(Boolean);
    const urls = [[t('name.deck'), PF.visibleUrl(PF.projectUrl(p.id)), PF.projectUrl(p.id), 'page'], [t('name.doc'), PF.visibleUrl(PF.docUrl(p.id)), PF.docUrl(p.id), 'page'],
      isUrl(p.links?.github) && ['GitHub', shortUrl(p.links.github), p.links.github, 'external'], isUrl(p.links?.video) && [t('name.video'), shortUrl(p.links.video), p.links.video, 'external'],
      ...extra.map((l) => [l.label, shortUrl(l.url), l.url, 'external'])].filter(Boolean);
    const cover = p.cover ? `<figure class="cover"><img src="${esc(PF.srcPath(p.id, p.cover))}" alt="${esc(p.title)} 대표 화면"></figure>` : '';
    const body = `${p.tagline ? `<p class="tagline">${inline(p.tagline)}</p>` : ''}
      <div class="pi${cover ? '' : ' nocover'}">${cover}<div class="pi-r">
        ${meta.length ? `<dl class="meta">${meta.join('')}</dl>` : ''}
        ${p.intent?.text ? `<div class="intent"><p class="k">${T('name.intent')}</p><p>${inline(p.intent.text)}</p></div>` : ''}
        ${(p.tags || []).length ? `<ul class="tags">${p.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <div class="btns no-print">${btns.join('')}</div>${printUrls(urls)}</div></div>`;
    return sec(`p-${p.id}`, no, p.title, PF.teamLabel(p.team), body, 'proj print-only');
  }

  // 핵심 기능(화면만): 위에 프로젝트 탭, 아래에 그 프로젝트의 기능 카드(최대 4개 한 줄).
  //   카드 = 그림(같은 크기 틀 안에 원래 비율 그대로 — 잘리거나 늘어나지 않음) · 번호 · 기능 이름 · 문제(What) · 기능(summary) · [슬라이드 열기]
  //   (직접 고침 11/20) 문제·기능 두 칸을 라벨과 함께. 카드끼리 같은 줄에 오게 subgrid(빈 칸도 자리를 지킴)
  function keyFeatures(projects) {
    const list = projects.filter((p) => (p.highlights || []).length);
    if (!list.length) return '';
    const capText = (c) => (typeof c === 'string' ? c : c?.text || '');
    const tabs = list.map((p, i) => `<button type="button" role="tab" class="kf-tab" id="kf-tab-${i}" aria-controls="kf-${i}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}>${esc(p.title)}</button>`).join('');
    const panels = list.map((p, i) => {
      const hl = p.highlights.slice(0, 4);
      return `<div class="kf-panel" role="tabpanel" id="kf-${i}" aria-labelledby="kf-tab-${i}"${i ? ' hidden' : ''}>
        <h3 class="kf-proj">${esc(p.title)}<span>${esc(PF.teamLabel(p.team))}</span></h3><ol class="kf-grid">${hl.map((h, j) => {
        const im = h.image?.src ? `<img src="${esc(PF.srcPath(p.id, h.image.src))}" alt="${esc(capText(h.image.caption) || h.title)}"${h.image.w && h.image.h ? ` width="${h.image.w}" height="${h.image.h}"` : ''}>` : '';
        return `<li class="kf-card"><div class="kf-media${im ? '' : ' empty'}">${im}</div>
          <p class="kf-n">${T('en.feature')} ${pad2(j + 1)}</p><h4>${inline(h.title)}</h4>
          <p class="kf-lab">${h.what ? T('page.kf-problem') : ''}</p><p class="kf-txt">${h.what ? inline(h.what) : ''}</p>
          <p class="kf-lab">${h.summary ? T('page.kf-solution') : ''}</p><p class="kf-txt">${h.summary ? inline(h.summary) : ''}</p>
          <div class="kf-links">${link({ href: PF.projectUrl(p.id, PF.deckSceneFor(p, h.section)), label: T('page.see-in-deck'), kind: 'page', cls: 'kf-link',
            attrs: `aria-label="${esc(PF.normTitle(h.title))} — ${T('page.see-in-deck')} (새 탭)"` })}${link({ href: PF.docUrl(p.id, h.section ? `sec=${encodeURIComponent(h.section)}` : ''), label: T('page.see-in-doc'), kind: 'page', cls: 'kf-link',
            attrs: `aria-label="${esc(PF.normTitle(h.title))} — ${T('page.see-in-doc')} (새 탭)"` })}</div></li>`;
      }).join('')}</ol></div>`;
    }).join('');
    return `<section id="features" class="sec kf no-print"><div class="wrap">
      <div class="sec-head"><div><p class="eyebrow">${T('en.key-features')}</p><h2>${T('page.key-features')}</h2></div>
        <div class="kf-tabs" role="tablist" aria-label="${T('page.key-features')}">${tabs}</div></div>${panels}</div></section>`;
  }

  // 기능 소개: 화면은 왼쪽(기능 번호와 함께), 기능 설명과 [슬라이드 열기]는 오른쪽 목록. 화면이 하나도 없으면 목록이 폭 전체
  // 기능 한 줄 = What(어떤 문제) · How(어떻게 해결) · Why(왜 이 방법). 빈 칸은 줄째 뺌
  function whw(h) {
    const rows = [['what', h.what], ['how', h.how], ['why', h.why]].filter(([, v]) => v);
    if (!rows.length) return '';
    return `<dl class="whw">${rows.map(([k, v]) => `<div class="w-${k}"><dt>${T('en.' + k)}</dt><dd>${inline(v)}</dd></div>`).join('')}</dl>`;
  }

  function features(p, no, sec, btn) {
    const hl = (p.highlights || []).slice(0, 4);
    if (!hl.length) return '';
    const capText = (c) => (typeof c === 'string' ? c : c?.text || '');      // 그림 설명은 글 조각 또는 글자
    const shots = hl.map((h, i) => ({ h, i })).filter(({ h }) => h.image?.src);
    const tiles = shots.map(({ h, i }) => {
      const d = h.image.w && h.image.h ? ` width="${h.image.w}" height="${h.image.h}"` : '';
      return `<figure class="shot" data-fi="${i}"><div class="shot-m"><img src="${esc(PF.srcPath(p.id, h.image.src))}" alt="${esc(capText(h.image.caption) || h.title)}"${d}></div>
        <figcaption><span class="n">${pad2(i + 1)}</span><span>${inline(capText(h.image.caption) || h.title)}</span></figcaption></figure>`;
    }).join('');
    const rows = hl.map((h, i) => `<li data-fi="${i}"><div class="fr-t"><p class="fk">${T('en.feature')} ${pad2(i + 1)}</p><h3>${inline(h.title)}</h3>${whw(h)}</div>
      <div class="fr-a">${link({ href: PF.projectUrl(p.id, PF.deckSceneFor(p, h.section)), label: T('page.see-in-deck'), kind: 'page', cls: 'pill',
        attrs: `aria-label="${esc(PF.normTitle(h.title))} — ${T('page.see-in-deck')} (새 탭)"` })}${link({ href: PF.docUrl(p.id, h.section ? `sec=${encodeURIComponent(h.section)}` : ''), label: T('page.see-in-doc'), kind: 'page', cls: 'pill',
        attrs: `aria-label="${esc(PF.normTitle(h.title))} — ${T('page.see-in-doc')} (새 탭)"` })}</div></li>`).join('');
    const body = `<div class="fe${shots.length ? '' : ' noshot'}" style="--shots:${shots.length}">${shots.length ? `<div class="shots">${tiles}</div>` : ''}
      <div class="fe-r"><ol class="flist">${rows}</ol>
        <div class="btns end no-print">${btn(PF.projectUrl(p.id), T('page.deck-all'), 'page', 'btn primary')}${btn(PF.docUrl(p.id), T('name.doc'), 'page')}</div></div></div>`;
    return sec(`p-${p.id}-core`, `${no} · ${t('page.features')}`, p.title, PF.teamLabel(p.team), body, 'tint core print-only');
  }

  function projLinks(p) {
    return [link({ href: PF.projectUrl(p.id), label: T('name.deck'), kind: 'page' }), link({ href: PF.docUrl(p.id), label: T('name.doc-short'), kind: 'page' }),
      isUrl(p.links?.github) && link({ href: p.links.github, label: 'GitHub' }), isUrl(p.links?.video) && link({ href: p.links.video, label: T('name.video') })].filter(Boolean).join('');
  }

  // 화면과 설명 짝 강조(마우스·키보드 포커스) + [PDF로 저장]
  function bind() {
    const pair = (el, on) => {
      const item = el.closest('[data-fi]');
      const box = item?.closest('.fe');
      if (!box) return;
      box.querySelectorAll(`[data-fi="${item.dataset.fi}"]`).forEach((x) => x.classList.toggle('on', on));
    };
    root.addEventListener('mouseover', (e) => pair(e.target, true));
    root.addEventListener('mouseout', (e) => pair(e.target, false));
    root.addEventListener('focusin', (e) => pair(e.target, true));
    root.addEventListener('focusout', (e) => pair(e.target, false));
    PF.bindMode(root);
    workCtl = bindWork();
    tabsCtl = bindTabs();
    bindPaging(workCtl);
    bindContact();
    root.addEventListener('click', (e) => {                            // 기술 스택 근거 칩 등 #p-<폴더> 링크: 화면에서는 그 절이 인쇄 전용이라 대표 프로젝트로
      const a = e.target.closest('a[href^="#p-"]');
      if (a && redirect(decodeURIComponent(a.getAttribute('href').slice(1)))) e.preventDefault();
    });
    root.querySelector('[data-pdf]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget, label = b.textContent;
      b.disabled = true; b.textContent = t('ui.preparing');
      await loadAll(15000);                                            // 아래쪽 그림까지 받은 뒤 인쇄(늦게 받는 그림은 PDF에서 빠짐)
      b.disabled = false; b.textContent = label;
      window.print();
    });
    addEventListener('beforeprint', () => eager());                    // Ctrl+P: 아직 받지 않은 그림을 바로 받기 시작(할 수 있는 만큼)
  }

  // ── 부드러운 세로 이동(대표 프로젝트 넘기기 · 절 넘기기 공용) ──
  //   정해 둔 시간 동안 처음 빠르고 끝에서 느려지게. 움직임 줄이기 설정이면 바로 이동. 가려진 창(rAF 멈춤)에서도 끝 위치에 닿게 시간 초과로 마무리
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const GLIDE_MS = 560;
  const onGlide = [];                                                  // 움직일 때마다 부를 것(대표 프로젝트 트랙 위치 — 스크롤 이벤트가 늦거나 없는 창에서도 맞게)
  const moveTo = (y) => { scrollTo({ top: y, behavior: 'instant' }); onGlide.forEach((f) => f()); };
  let anim = null;
  function glide(to) {
    to = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, to));
    cancelAnimationFrame(anim?.raf ?? 0);
    const from = scrollY, d = to - from;
    if (Math.abs(d) < 1 || reduceMotion.matches) { moveTo(to); anim = null; return; }
    const t0 = performance.now(), ease = (k) => 1 - Math.pow(1 - k, 3);
    const a = anim = { to, raf: 0 };
    const step = (now) => {
      if (anim !== a) return;
      const k = Math.min(1, (now - t0) / GLIDE_MS);
      moveTo(from + d * ease(k));
      if (k < 1) a.raf = requestAnimationFrame(step); else anim = null;
    };
    a.raf = requestAnimationFrame(step);
    setTimeout(() => { if (anim === a) { cancelAnimationFrame(a.raf); moveTo(to); anim = null; } }, GLIDE_MS + 400);
  }
  // 넓고 충분히 높은 화면에서만 한 화면씩 넘김(휴대폰·낮은 창은 보통 스크롤)
  const narrowView = matchMedia('(max-width: 759px), (max-height: 560px)');
  const topH = () => root.querySelector('.top')?.offsetHeight || 0;
  const docTop = (el) => el.getBoundingClientRect().top + scrollY;
  let lastWheel = 0;

  // ── 대표 프로젝트 넘기기 ──
  //   넓은 화면: 절이 머리 막대 아래에 붙어 있는 동안(.work 높이만큼) 세로 스크롤이 트랙을 가로로 옮김. 휠은 bindPaging이 받아 wheel(dir)로 넘겨 줌
  //   스크롤바·키보드로 어중간한 곳에 멈추면 가까운 프로젝트로 맞춤. 좁은 화면: 붙여 두지 않고 손가락으로 가로로 밀어 넘김
  function bindWork() {
    const sec = root.querySelector('#work');
    if (!sec) return null;
    const track = sec.querySelector('.w-track'), view = sec.querySelector('.w-view'), frame = sec.querySelector('.w-frame');
    const N = track.children.length;
    const prev = sec.querySelector('[data-w-prev]'), next = sec.querySelector('[data-w-next]'), cur = sec.querySelector('[data-w-cur]');
    const STEP = .9;                                                   // 프로젝트 하나에 드는 세로 거리(화면 높이 배수)
    const pinned = () => !narrowView.matches && N > 1;
    let index = 0;

    const show = (i) => {
      index = Math.max(0, Math.min(N - 1, i));
      if (cur) cur.textContent = pad2(index + 1);
      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index === N - 1;
    };
    const start = () => docTop(sec) - (parseFloat(getComputedStyle(frame).top) || 0);   // 붙기 시작하는 세로 위치
    const range = () => Math.max(1, sec.offsetHeight - frame.offsetHeight);
    const yOf = (i) => start() + (range() * i) / Math.max(1, N - 1);
    const pos = () => Math.max(0, Math.min(1, (scrollY - start()) / range())) * (N - 1);   // 지금 몇 번째(소수)
    const inside = () => pinned() && scrollY >= start() - 2 && scrollY <= start() + range() + 2;

    function layout() {
      if (!pinned()) { sec.style.height = ''; track.style.transform = ''; show(Math.round(track.scrollLeft / Math.max(1, track.clientWidth))); return; }
      sec.style.height = `${frame.offsetHeight + innerHeight * STEP * (N - 1)}px`;
      onScroll();
    }
    function onScroll() {
      if (!pinned()) return;
      const x = pos();
      track.style.transform = `translate3d(${-x * track.clientWidth}px,0,0)`;
      view.scrollLeft = 0;                                             // 포커스 이동으로 브라우저가 몰래 가로 스크롤한 것 되돌림
      show(Math.round(x));
    }
    function go(i, jump = false) {
      i = Math.max(0, Math.min(N - 1, i));
      if (pinned()) { if (jump) moveTo(yOf(i)); else glide(yOf(i)); }
      else { track.scrollTo({ left: track.children[i].offsetLeft - track.offsetLeft, behavior: jump || reduceMotion.matches ? 'auto' : 'smooth' }); show(i); }
    }
    // 휠 한 번: 붙어 있는 구간 안이면 바로 다음(이전) 프로젝트로 → true. 처음·끝에서 바깥쪽이거나 구간 밖이면 false(절 넘기기가 받음)
    function wheel(dir) {
      if (!inside()) return false;
      const x = pos();
      const target = dir > 0 ? Math.floor(x + 1e-3) + 1 : Math.ceil(x - 1e-3) - 1;
      if (target < 0 || target > N - 1) return false;
      go(target);
      return true;
    }

    let idle = 0;
    addEventListener('scroll', () => {
      onScroll();
      clearTimeout(idle);
      idle = setTimeout(() => {                                        // 스크롤바·키보드로 어중간하게 멈춘 경우만
        if (!pinned() || anim || performance.now() - lastWheel < 300) return;
        const s = start(), r = range();
        if (scrollY <= s + 1 || scrollY >= s + r - 1) return;
        const x = pos();
        if (Math.abs(x - Math.round(x)) > .01) glide(yOf(Math.round(x)));
      }, 160);
    }, { passive: true });
    addEventListener('resize', layout);
    narrowView.addEventListener?.('change', layout);
    prev?.addEventListener('click', () => go(index - 1));
    next?.addEventListener('click', () => go(index + 1));
    track.addEventListener('scroll', () => { if (!pinned()) show(Math.round(track.scrollLeft / Math.max(1, track.clientWidth))); }, { passive: true });
    sec.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    });
    track.addEventListener('focusin', (e) => {                         // 키보드로 다른 프로젝트의 링크에 들어가면 그 프로젝트를 정면으로
      const s = e.target.closest('.slide');
      const i = s ? [...track.children].indexOf(s) : -1;
      if (i >= 0 && i !== index) go(i);
    });
    addEventListener('load', layout);
    onGlide.push(onScroll);
    layout(); show(0);
    return { wheel, go, layout };
  }

  // ── 절 넘기기: 머리 · 대표 프로젝트 · 소개 · 핵심 기능 · 연락처를 한 화면씩 ──
  //   휠(또는 PageDown·PageUp·Space·↑·↓) 한 번 = 다음(이전) 절의 맨 위로 미끄러짐. 대표 프로젝트 안에서는 먼저 프로젝트를 넘기고, 마지막에서 다음 절로.
  //   절이 화면보다 길면(메시지 칸을 펼친 연락처 등) 그 안에서는 보통 스크롤, 끝에 닿으면 다음 절로. 트랙패드 관성 휠은 넘어가는 동안 삼킴
  function bindPaging(work) {
    const paged = () => !narrowView.matches;
    const pages = () => [...root.querySelectorAll('main > section[id], main > footer[id]')].filter((s) => s.offsetHeight > 0);
    let held = false;
    const pageTop = (s) => Math.max(0, docTop(s) - topH());
    const current = (list) => {
      const vt = scrollY + topH();
      let i = 0;
      list.forEach((s, k) => { if (docTop(s) <= vt + 2) i = k; });
      return i;
    };
    // 한 걸음(dir: 1 아래 · -1 위, dy: 이번 입력의 크기). 직접 움직였으면 true, 보통 스크롤에 맡기면 false
    function step(dir, dy) {
      const list = pages();
      if (!list.length) return false;
      const vt = scrollY + topH(), vb = scrollY + innerHeight;
      const i = current(list);
      const s = list[i], top = docTop(s), bot = top + s.offsetHeight;
      if (dir > 0) {
        const rest = bot - vb;
        if (rest > 2) { if (rest > dy) return false; glide(bot - innerHeight); return true; }   // 절 안에 남은 내용: 보통 스크롤, 끝 직전이면 끝에 맞춤
        if (i + 1 >= list.length) return false;
        glide(pageTop(list[i + 1]));
        return true;
      }
      const rest = vt - top;
      if (rest > 2) { if (rest > dy) return false; glide(pageTop(s)); return true; }
      if (i === 0) return false;
      const p = list[i - 1];
      glide(Math.max(pageTop(p), docTop(p) + p.offsetHeight - innerHeight));   // 앞 절이 길면 그 끝(대표 프로젝트면 마지막 프로젝트)으로
      return true;
    }
    addEventListener('wheel', (e) => {
      if (!paged() || e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      if (e.target.closest?.('textarea')) return;                      // 메시지 입력칸 안의 스크롤은 그대로
      const now = performance.now(), gap = now - lastWheel;
      lastWheel = now;
      if (held && gap < 160) { e.preventDefault(); return; }           // 방금 넘긴 휠 동작의 나머지(트랙패드 관성) — 멈출 때까지 삼킴
      held = false;
      const dir = Math.sign(e.deltaY);
      if (!dir) return;
      const dy = Math.abs(e.deltaY) * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
      if ((work && work.wheel(dir)) || step(dir, dy)) { e.preventDefault(); held = true; }
    }, { passive: false });
    // 키보드: PageDown·PageUp·Space, ↑·↓도 휠 한 번과 같게(한 번 누를 때마다 한 절 · 대표 프로젝트 안에서는 한 프로젝트)
    addEventListener('keydown', (e) => {
      if (!paged() || e.altKey || e.ctrlKey || e.metaKey) return;
      const arrow = e.key === 'ArrowDown' || e.key === 'ArrowUp';
      // 입력칸에서는 그대로. Space는 버튼·링크를 누르는 키라 그 위에서는 그대로, ↑↓는 버튼·링크 위에서도 넘김
      if (e.target.closest?.(arrow ? 'input, textarea, select, [contenteditable]' : 'input, textarea, select, button, a, [contenteditable], [role="tab"]')) return;
      const dir = e.key === 'PageDown' || e.key === 'ArrowDown' || (e.key === ' ' && !e.shiftKey) ? 1
        : e.key === 'PageUp' || e.key === 'ArrowUp' || (e.key === ' ' && e.shiftKey) ? -1 : 0;
      if (!dir) return;
      if (anim) { e.preventDefault(); return; }                        // 넘어가는 중(키를 꾹 누른 반복 포함)이면 한 번만 넘기고 기다림
      if ((work && work.wheel(dir)) || step(dir, innerHeight * .9)) e.preventDefault();
    });
    // 스크롤바로 절 사이 어중간한 곳에 멈추면(화면보다 짧은 절일 때만) 가까운 절 맨 위로
    let idle = 0;
    addEventListener('scroll', () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        if (!paged() || anim || performance.now() - lastWheel < 300) return;
        const list = pages();
        const i = current(list), s = list[i];
        if (!s || s.id === 'work' || s.offsetHeight > innerHeight - topH() + 4) return;   // 대표 프로젝트는 bindWork가, 긴 절은 그대로
        const off = scrollY + topH() - docTop(s);
        if (off < 3) return;
        const nextS = list[i + 1];
        glide(off < s.offsetHeight / 2 || !nextS ? pageTop(s) : pageTop(nextS));
      }, 220);
    }, { passive: true });
  }

  // ── 핵심 기능 탭: 누르거나 ←·→로 프로젝트를 바꿈 ──
  function bindTabs() {
    const tabs = [...root.querySelectorAll('.kf-tab')];
    const pick = (i, focus) => {
      tabs.forEach((b, k) => {
        const on = k === i;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        root.querySelector(`#${b.getAttribute('aria-controls')}`).hidden = !on;
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach((b, i) => {
      b.addEventListener('click', () => pick(i));
      b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); pick((i + d + tabs.length) % tabs.length, true); }
      });
    });
    return { pick };
  }

  // ── 메시지 칸(이메일을 누르면 아래로 펼쳐짐) ──
  const WEB3FORMS_KEY = 'c43ec51e-4ee3-4563-89d2-fdf4770ee07e';
  function bindContact() {
    const panel = root.querySelector('#msg'), toggle = root.querySelector('[data-msg-toggle]');
    if (!panel || !toggle) return;
    const form = panel.querySelector('form'), st = form.querySelector('.msg-st'), send = form.querySelector('.msg-send');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const say = (s, cls = '') => { st.textContent = s; st.className = `msg-st ${cls}`; };
    const setOpen = (open) => {
      panel.classList.toggle('open', open);
      panel.inert = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (!open) return;
      say('');
      setTimeout(() => form.elements.name.focus({ preventScroll: true }), 50);
      setTimeout(() => panel.scrollIntoView({ behavior: reduce.matches ? 'instant' : 'smooth', block: 'nearest' }), 380);   // 펼친 칸 전체가 보이게
    };
    toggle.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
    panel.querySelector('[data-msg-close]').addEventListener('click', () => { setOpen(false); toggle.focus(); });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); toggle.focus(); } });
    root.querySelectorAll('[data-open-msg]').forEach((b) => b.addEventListener('click', () => {   // 첫 화면 연락처의 이메일: 맨 아래로 가서 펼침
      setOpen(true);
      root.querySelector('#contact').scrollIntoView({ behavior: reduce.matches ? 'instant' : 'smooth', block: 'start' });
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      const empty = ['name', 'contact', 'message'].find((k) => !f[k].value.trim());
      if (empty) { say(t('page.msg-empty'), 'err'); f[empty].focus(); return; }
      if (f.botcheck.checked) return;                                  // 자동 스팸 봇
      send.disabled = true; say(t('page.msg-sending'));
      const data = new FormData();                                     // FormData = 사전 확인(preflight) 요청 없음 → Web3Forms가 막지 않음
      data.append('access_key', WEB3FORMS_KEY);
      data.append('subject', `[포트폴리오] ${f.name.value.trim()} 님의 메시지`);
      data.append('from_name', '포트폴리오 메시지');
      data.append('Name', f.name.value.trim());
      data.append('Contact', f.contact.value.trim());
      data.append('Message', f.message.value.trim());
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
      try {
        const r = await fetch('https://api.web3forms.com/submit', { method: 'POST', headers: { Accept: 'application/json' }, body: data, signal: ctl.signal });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.success !== true) throw new Error(j.message || r.status);
        form.reset(); say(t('page.msg-ok'), 'ok');
      } catch (err) {
        console.warn('[portfolio] 메시지 보내기 실패:', err);
        say(t('page.msg-fail', { email: toggle.textContent }), 'err');
      } finally { clearTimeout(timer); send.disabled = false; }
    });
  }

  // (직접 고침 11/20) 대표 프로젝트 칸(.w-shot)은 인쇄되지 않고 움직이는 그림이 2~3MB라 미리 받지 않음(화면에 올 때 받음)
  const eager = () => document.querySelectorAll('img[loading="lazy"]:not(.w-shot img)').forEach((i) => { i.loading = 'eager'; });
  const loaded = (i) => (i.complete ? null : new Promise((r) => {     // decode()·rAF는 쓰지 않음: 가려진 창에서 끝나지 않음(슬라이드 키트와 같은 이유)
    i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }));
  async function loadAll(ms) {
    eager();
    await Promise.race([Promise.all([...document.images].map(loaded)), new Promise((r) => setTimeout(r, ms))]);
  }

  // 준비: 데스크톱 기기면 그림을 미리 다 받아 Ctrl+P도 빠짐없이 인쇄(휴대폰·데이터 절약 모드는 화면에 올 때 받음)
  async function settle() {
    const desk = matchMedia('(pointer: fine)').matches && !(navigator.connection && navigator.connection.saveData);
    if (desk) eager();
    await Promise.race([Promise.all([...document.querySelectorAll('img:not([loading="lazy"])')].map(loaded)), new Promise((r) => setTimeout(r, 20000))]);
    if (document.fonts) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
    if (!userMoved) {                                                  // 글꼴이 바뀌며 절 높이가 달라져 도착 위치가 밀린 만큼 다시 맞춤
      const el = arrived && document.getElementById(arrived);
      if (el && !redirect(arrived)) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      else if (restoreY) scrollTo({ top: restoreY, behavior: 'instant' });
    }
    html.dataset.pfReady = 'yes';
    resolveReady(report());
    if (new URLSearchParams(location.search).get('pf-audit') === '1') writeAudit();
  }

  function report() {
    const imgs = [...document.images];
    return {
      page: 'portfolio', ready: html.dataset.pfReady, sections: info.sections, projects: info.projects,
      images: { total: imgs.length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
                pending: imgs.filter((i) => !i.complete).map((i) => i.getAttribute('src')) },
      deckLinks: [...document.querySelectorAll('.flist a.pill')].map((a) => a.getAttribute('href')),
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      errors: info.errors, strings: PF.stringsReport(),
    };
  }
  function writeAudit() {
    let pre = document.getElementById('pf-audit');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'pf-audit'; pre.hidden = true; document.body.appendChild(pre); }
    const bytes = new TextEncoder().encode(JSON.stringify(report()));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    pre.textContent = btoa(bin);
  }
})();
