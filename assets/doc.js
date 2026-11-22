// 프로젝트 상세 문서 — doc.html?p=<폴더>  (portfolio-structure §4, 링크 §5, 결정 F2·F3·F6·F10)
//   흐르는 읽기 문서. 레이아웃 ① 가운데 정렬(spikes/doc-layout/doc.html?layout=1). 출처: spikes/doc-layout/doc.js
//   주석의 설계 근거(docs/design/…의 portfolio-structure·deck-vs-scroll·01 §, R0, 결정 F·Q·# 번호)와 원본 시안(spikes/…)은 템플릿 유지관리용 maintainer 브랜치에 있습니다. 이 레포에 없어도 정상입니다.
//   문서 처리 순서: marked 12.0.2(gfm) → 상대경로 → GitHub식 slug(PF.slugger) — 여기까지 md-blocks.js(PF.md.parse, 슬라이드와 같은 규칙) → 목차 → Mermaid 11.4.1 → highlight.js 11.9.0
//   주소: #<제목 slug>(슬라이드·옛 project.html 조각이 이 형식으로 옴) · #sec=<절 제목>(제목을 찾아 #<slug>로 바꿈)
//   슬라이드로: 머리 [슬라이드 ↗](새 탭). 예전의 절 머리 칩·목차 ★(슬라이드 장면 연결)는 없앴습니다(결정 G1)
//   내용은 data/projects/<폴더>.json + src/<폴더>/<프로젝트 문서>만 씁니다. UI 문구는 문구 표(PF.t, assets/strings.js + theme/strings.tsv)에서 옵니다.
//   점검: await PFDoc.whenReady() → PFDoc.report() — errors(못 읽은 파일·그리지 못한 다이어그램) · images(깨진·아직 받는 그림) · diagrams · strings(문구 표).
//         whenReady는 문서·Mermaid·코드 처리와 글꼴까지만 기다립니다(그림은 기다리지 않음 → images.pending으로 봄)
//         ?pf-audit=1이면 그림까지 기다린 뒤 #pf-audit에 report()의 base64 JSON(headless용, 슬라이드·포트폴리오 페이지와 같은 형식)
(async () => {
  const root = document.getElementById('app');
  const html = document.documentElement;
  const errors = [];
  let resolveReady;
  const whenReady = new Promise((r) => { resolveReady = r; });
  const report = () => {
    const imgs = [...document.querySelectorAll('#doc img')];
    const figs = [...document.querySelectorAll('#doc figure.mmd')];
    return {
      page: 'doc', ready: html.dataset.docReady === '1',
      images: { total: imgs.length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
                pending: imgs.filter((i) => !i.complete).map((i) => i.getAttribute('src')) },
      diagrams: { total: figs.length, failed: figs.filter((f) => !f.querySelector('.mermaid svg')).map((f) => f.dataset.label || '') },
      errors, strings: PF.stringsReport(),
    };
  };
  window.PFDoc = Object.assign(window.PFDoc || {}, { whenReady: () => whenReady, report });
  // Mermaid가 페이지 load 때 스스로 그리지 않게 맨 먼저 끕니다(아래 await 사이에 load가 오면 기본 설정으로 먼저 그려 버림)
  if (window.mermaid) mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', fontFamily: 'Pretendard, sans-serif' });
  if (PF.guardFileProtocol(root)) { errors.push('file:// — 로컬 서버로 열어야 합니다'); return done(); }

  const { esc, inline, link, markNewTab } = PF;
  const T = (k, v) => esc(PF.t(k, v));                                 // HTML에 넣는 문구
  const Q = new URLSearchParams(location.search);
  const id = Q.get('p');
  const srcPath = (rel) => PF.srcPath(id, rel);
  const deckUrl = (sid = '') => PF.projectUrl(id, sid);
  const back = `<p>${link({ href: 'index.html', label: '← 포트폴리오로', kind: 'page', cls: 'btn' })}</p>`;
  const headText = new Map();                                        // 제목 요소 → 원문 제목 글자(링크 표시·각주가 붙기 전)
  const htext = (h) => headText.get(h) ?? h.textContent.trim();
  let releaseHold = null;                                            // 도착한 제목 붙잡기(hold) 해제 함수

  if (!id) { errors.push('no-project: 주소에 ?p=<폴더 이름>이 없습니다'); PF.notice(root, '프로젝트를 고르세요', `<p>주소 끝에 <code>?p=폴더이름</code>을 붙여 주세요.</p>${back}`); return done(); }
  const [pf] = await Promise.all([PF.loadJSON('data/portfolio.json').catch(() => ({})), PF.loadStrings()]);
  PF.applyTheme(pf.settings?.accent);
  document.querySelector('.skip-link')?.replaceChildren(PF.t('ui.skip'));
  let p;
  try {
    p = await PF.loadJSON(`data/projects/${encodeURIComponent(id)}.json`);
  } catch (err) {
    errors.push(`data/projects/${id}.json: ${err && err.message || err}`);
    PF.notice(root, '프로젝트를 찾을 수 없습니다', `<p>${esc(err.message)}</p>${back}`);
    return done();
  }
  const name = pf.profile?.name || '';
  document.title = `${p.title} — ${PF.t('name.doc')}${name ? ' · ' + name : ''}`;

  // 문서 끝: 다른 프로젝트로 바로 넘어가기 + 연락처(포트폴리오 문서 맨 아래 연락처와 같은 내용). 못 읽은 프로젝트는 건너뜀
  const order = (pf.projects || []).map(String);
  const others = (await Promise.all(order.filter((x) => x !== id).map((x) =>
    PF.loadJSON(`data/projects/${encodeURIComponent(x)}.json`).then((q) => ({ ...q, id: x })).catch(() => null)))).filter(Boolean);
  const prof = pf.profile || {};
  const total = String(order.length).padStart(2, '0');
  const moreHtml = others.length ? `<div class="dn-block"><p class="eyebrow">${T('doc.other-projects')}</p><ul class="dn-list">${others.map((q) => `<li class="dn-card">
      <p class="dn-no">${esc(PF.t('page.project-no', { no: String(order.indexOf(q.id) + 1).padStart(2, '0'), total }))}</p>
      <h2>${link({ href: `doc.html?p=${encodeURIComponent(q.id)}`, label: esc(q.title), kind: 'anchor' })}</h2>
      ${q.tagline ? `<p class="dn-tag">${inline(q.tagline)}</p>` : ''}
      <div class="actions">${link({ href: `doc.html?p=${encodeURIComponent(q.id)}`, label: T('name.doc'), kind: 'anchor', cls: 'btn primary' })}${link({ href: PF.projectUrl(q.id), label: T('name.deck'), kind: 'page', cls: 'btn' })}</div>
    </li>`).join('')}</ul></div>` : '';
  const contactHtml = (prof.email || PF.isUrl(prof.github) || (prof.links || []).some((l) => PF.isUrl(l.url))) ? `<div class="dn-block dn-contact"><p class="eyebrow">${T('en.contact')}</p>
      <p class="dn-name">${esc(name)}</p>
      <div class="actions">${[prof.email && link({ href: `mailto:${prof.email}`, label: esc(prof.email), kind: 'mail', cls: 'btn' }),
        PF.isUrl(prof.github) && link({ href: prof.github, label: 'GitHub', kind: 'external', cls: 'btn' }),
        ...(prof.links || []).filter((l) => PF.isUrl(l.url)).map((l) => link({ href: l.url, label: esc(l.label), kind: 'external', cls: 'btn' })),
        link({ href: 'index.html', label: T('ui.back'), kind: 'page', cls: 'btn' })].filter(Boolean).join('')}</div></div>` : '';
  const nextHtml = moreHtml || contactHtml ? `<section class="doc-next" aria-label="${esc(PF.t('doc.other-projects'))}"><div class="dn-in">${moreHtml}${contactHtml}</div></section>` : '';

  // ── 뼈대 ──
  const metaRows = (p.meta || []).map((m) => `<div><dt>${esc(m.label)}</dt><dd>${inline(m.value)}</dd></div>`).join('') +
    (p.team?.role ? `<div class="role"><dt>${T('name.role')}</dt><dd>${inline(p.team.role)}</dd></div>` : '');
  const ext = [
    PF.isUrl(p.links?.github) && link({ href: p.links.github, label: 'GitHub', kind: 'external', cls: 'btn' }),
    PF.isUrl(p.links?.video) && link({ href: p.links.video, label: T('name.video'), kind: 'external', cls: 'btn' }),
    ...(p.links?.extra || []).filter((l) => PF.isUrl(l.url)).map((l) => link({ href: l.url, label: esc(l.label), kind: 'external', cls: 'btn' })),
  ].filter(Boolean);
  const deckBtn = link({ href: deckUrl(), label: T('name.deck'), kind: 'page', cls: 'btn primary' });
  const tags = (p.tags || []).length ? `<ul class="tags">${p.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';

  root.innerHTML = `
    <header class="doc-head">
      <div class="doc-head-in">
        <p class="crumb">${link({ href: 'index.html', label: T('ui.back'), kind: 'page' })}<span aria-hidden="true">›</span><b>${esc(p.title)} — ${T('name.doc')}</b></p>
        <nav class="head-nav" aria-label="프로젝트 링크">
          ${deckBtn}${ext.join('')}
          <span class="newtab-note">${T('ui.newtab')}</span>
        </nav>
        ${PF.modeButton()}
      </div>
    </header>
    ${p.cover ? `<div class="doc-hero" aria-hidden="true"><img src="${esc(srcPath(p.cover))}" alt="" decoding="async" onerror="this.parentElement.remove()"></div>` : ''}
    <div class="print-only print-urls"></div>
    <div class="doc-page">
      <nav class="toc" id="toc" aria-label="문서 목차"><p class="toc-title">${T('name.toc')}</p><div class="toc-links" id="toc-links"></div></nav>
      <main class="doc-main" id="main" tabindex="-1">
        <div class="doc-intro">
          <p class="eyebrow">${T('name.doc')}</p>
          <h1>${esc(p.title)}</h1>
          <dl class="meta-line">${metaRows}</dl>
          ${tags}
          <details class="glance" id="glance"><summary>${T('doc.glance')}</summary>
            <div class="glance-body"><div class="actions">${deckBtn}${ext.join('')}</div>
            <p class="newtab-note">${T('doc.deck-note')}</p></div>
          </details>
        </div>
        <article class="md" id="doc"><p class="loading">프로젝트 문서를 불러오는 중…</p></article>
      </main>
      <aside class="rail" aria-label="프로젝트 정보">
        <section class="rail-card"><p class="rail-title">${T('doc.rail-project')}</p><dl class="rail-meta">${metaRows}</dl>
          <div class="actions">${deckBtn}${ext.join('')}</div></section>
        <section class="rail-card rail-misc">
          ${link({ href: srcPath(p.doc), label: T('doc.raw-md'), kind: 'file' })}
          ${PF.isUrl(p.links?.github) ? link({ href: p.links.github, label: T('doc.raw-github'), kind: 'external' }) : ''}
          <a href="#top" class="to-top">${T('doc.top')} ↑</a>
        </section>
      </aside>
    </div>
    <div class="doc-fab" role="group" aria-label="빠른 이동"><button type="button" class="fab-toc" aria-haspopup="dialog">${T('name.toc')}</button><a class="fab-top" href="#top" aria-label="맨 위로">↑</a></div>
    <dialog class="toc-dialog" aria-label="문서 목차"><div class="toc-dialog-head"><p class="toc-title">${T('name.toc')}</p><button type="button" class="btn dlg-close">${T('ui.close')}</button></div><div class="toc-links"></div></dialog>
    ${nextHtml}
    <footer class="doc-foot"><span>© ${esc(name)}</span>${link({ href: 'index.html', label: T('ui.back'), kind: 'page' })}</footer>`;
  PF.bindMode(root);

  // 좁은 화면(< 720px)에서는 "한눈에" 상자를 접어 둠
  document.getElementById('glance').open = !matchMedia('(max-width: 719.98px)').matches;

  const zoom = lightbox();
  try { await renderDoc(); ready(); }
  catch (err) {                                                       // 그리다 멈추면 "불러오는 중…"에 머물지 않게 이유를 보이고 준비 신호는 냄
    errors.push(String(err && err.stack || err));
    console.error('[doc] 프로젝트 문서를 그리지 못함:', err);
    const doc = document.getElementById('doc');
    if (doc?.querySelector('.loading')) doc.innerHTML = `<p class="error">프로젝트 문서를 그리지 못했습니다 (${esc(err && err.message || err)}).</p>`;
  }
  done();

  // ───────────────────────────────────────────────────────────────
  async function renderDoc() {
    const doc = document.getElementById('doc');
    let md;
    try { md = await PF.loadText(srcPath(p.doc)); }
    catch (err) { errors.push(`doc: ${err.message}`); doc.innerHTML = `<p class="error">프로젝트 문서를 불러오지 못했습니다 (${esc(err.message)}).</p>`; return; }
    // ①② md HTML은 먼저 비활성 <template>에 넣고(그 안의 그림은 받지 않음) 상대경로·제목 id를 고친 뒤에 문서에 붙임(PF.md.parse, 슬라이드와 같은 규칙).
    //    제목 id는 GitHub 규칙(PF.slugger), 링크 분류(숨김 "(새 탭)")·인쇄 각주([n])가 섞이기 전의 원문 제목 글자로 계산하고, 그 글자를 목차·레일에도 씀
    const { frag, headings: hs } = PF.md.parse(md, id);
    // 머리말(제목 # 다음 ~ 첫 장 ## 앞: 한 줄 소개 인용문·개발 형태·개요 표·문서 구성)은 페이지 머리(.doc-intro)가 data로 이미 보여 주므로 본문에서 뺌(중복 방지)
    {
      const kids = [...frag.childNodes];
      const h2 = kids.findIndex((n) => n.nodeName === 'H2');
      if (h2 > 0) kids.slice(0, h2).forEach((n) => { if (n.nodeName !== 'H1') n.remove(); });
      // 맨 위 대표 그림(.doc-hero)과 같은 파일인 본문 그림은 한 번 더 보이지 않게 뺌(그림만 있는 문단째, 직접 고침 11/21)
      if (p.cover) frag.querySelectorAll('img[data-md-src]').forEach((img) => {
        if (img.getAttribute('data-md-src') !== p.cover) return;
        const para = img.closest('p');
        if (para && !para.textContent.trim() && para.querySelectorAll('img').length === 1) para.remove(); else img.remove();
      });
    }
    const { isRelative, decode } = PF.md;
    const headings = hs.map((h) => { headText.set(h.el, h.text); return h.el; });

    // ③ 링크 분류(§5-2)
    frag.querySelectorAll('a[href]').forEach((a) => classifyMdLink(a, isRelative, decode));
    doc.replaceChildren(frag);
    // 제목 앞 번호(2. · 2.1 · 2.1.3)를 .h-num으로 감싸 제목 글자와 색으로 나눔. 글자(textContent)는 그대로라 목차·딥링크·편집 모드에 영향 없음(직접 고침 11/21)
    doc.querySelectorAll('h2, h3, h4').forEach((h) => {
      const t = h.firstChild;
      if (!t || t.nodeType !== 3) return;
      const m = /^(\s*)(\d+(?:\.\d+)*\.?)(?=\s)/.exec(t.textContent);
      if (!m) return;
      const num = document.createElement('span');
      num.className = 'h-num';
      num.textContent = m[2];
      t.textContent = t.textContent.slice(m[0].length);
      h.insertBefore(num, t);
      if (m[1]) h.insertBefore(document.createTextNode(m[1]), num);
    });

    // ④ 제목 찾기(#sec=<절 제목> 딥링크용, PF.resolveHeading: 정확히 일치 → 앞부분 양방향 일치, 여럿이면 문서 순서상 첫 번째)
    const list = headings.map((h) => ({ text: htext(h), el: h }));
    const resolve = (title) => PF.resolveHeading(list, title)?.el || null;
    window.PFDoc = Object.assign(window.PFDoc || {}, { resolve });

    const tocHtml = headings.filter((h) => h.tagName === 'H2' || h.tagName === 'H3')
      .map((h) => `<a class="${h.tagName.toLowerCase()}" href="#${esc(h.id)}">${esc(htext(h))}</a>`).join('');
    document.querySelectorAll('.toc-links').forEach((el) => { el.innerHTML = tocHtml; });

    // ⑥ 표 → .table-wrap(스크롤 영역), 그림만 있는 문단 → .pf-figure
    let nTable = 0;
    doc.querySelectorAll('table').forEach((tb) => {
      const w = document.createElement('div');
      w.className = 'table-wrap';
      w.setAttribute('role', 'region'); w.tabIndex = 0; w.setAttribute('aria-label', `표 ${++nTable}`);
      tb.replaceWith(w); w.appendChild(tb);
    });
    doc.querySelectorAll('p').forEach((para) => {
      const kids = [...para.childNodes].filter((n) => !(n.nodeType === 3 && !n.textContent.trim()));
      const only = kids.length === 1 && kids[0].nodeType === 1 ? kids[0] : null;
      const img = only && (only.tagName === 'IMG' ? only : (only.tagName === 'A' && only.children.length >= 1 && [...only.childNodes].every((n) => n.nodeType === 1 ? n.tagName === 'IMG' || n.classList.contains('pf-newtab-icon') || n.classList.contains('pf-newtab-sr') : !n.textContent.trim()) ? only.querySelector('img') : null));
      if (img) {
        para.classList.add('pf-figure');
        // 그림 설명(alt)을 그림 아래에 보이게 함 — 전에는 [크게 보기] 창에서만 보였음
        const alt = (img.getAttribute('alt') || '').trim();
        if (alt) { const cap = document.createElement('span'); cap.className = 'pf-figcap'; cap.textContent = alt; para.appendChild(cap); }
      }
    });

    // ⑦ Mermaid (theme default, securityLevel loose). 글꼴을 먼저 받아 글자 폭을 맞춤
    let n = 0;
    const figs = [];
    doc.querySelectorAll('code.language-mermaid').forEach((code) => {
      const fig = document.createElement('figure');
      fig.className = 'mmd';
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.id = `mmd-${n++}`;
      div.textContent = PF.mmdText ? PF.mmdText(code.textContent) : code.textContent;   // note for 줄은 엔진이 그림(diagram-tidy.js)
      const acc = /^\s*accTitle\s*:\s*(.+)$/m.exec(code.textContent)?.[1]?.trim();
      fig.dataset.label = acc || PF.t('doc.diagram-n', { n });
      // 장 머리 요약 도표(%% feature-flow → .mmd-summary)와 작은 설명 도표(%% simple → .mmd-simple — 코어 루프 등, 코드 구조도가 아닌 것)는
      // 원문·크게 보기 줄을 보이지 않게. 줄은 다시 그릴 때 원문을 읽으므로 지우지 않고 숨김. 작은 설명 도표는 도표를 눌러 크게 볼 수 있음(⑪)(직접 고침 11/21)
      if (/^\s*%%\s*feature-flow\b/m.test(code.textContent)) fig.classList.add('mmd-summary');
      else if (/^\s*%%\s*simple\b/m.test(code.textContent)) fig.classList.add('mmd-simple');
      fig.appendChild(div);
      fig.insertAdjacentHTML('beforeend', `<div class="mmd-bar"><details class="mmd-src"><summary>${T('doc.diagram-src')}</summary><pre><code>${esc(code.textContent)}</code></pre></details>` +
        `<button type="button" class="mmd-zoom">${T('doc.zoom')}</button></div>`);
      (code.closest('pre') || code).replaceWith(fig);
      if (!acc) fig.dataset.label = diagramLabel(fig, code.textContent) || fig.dataset.label;
      figs.push(fig);
    });
    try { await Promise.race([Promise.all([document.fonts.load('16px Pretendard'), document.fonts.load('700 16px Pretendard')]), sleep(4000)]); } catch { /* 글꼴 없이 진행 */ }

    // ⑥-2 인쇄(A4 글줄 680px)에서 낱말 단위 줄바꿈으로는 들어가지 않는 표에만 .print-wide → 인쇄 CSS가 그 표에서만 낱말 중간 줄바꿈을 허용
    //   (모든 표에 허용하면 짧은 칸의 한글 낱말이 '방|식'처럼 끊김). 인쇄와 같은 표 규칙(doc.css .md.print-probe)으로 잼.
    //   목록·인용 안의 표는 조상의 좌우 안쪽 여백·테두리만큼 좁은 폭으로(인쇄에서도 같은 px). 그림·iframe 등은 불러오지 않게 빼고 잼.
    //   글꼴이 늦게 들어오면 다시 잼(대체 글꼴 폭으로 잰 결과가 남지 않게)
    const markPrintWide = () => {
      const probe = document.createElement('div');
      probe.className = 'md print-probe'; probe.setAttribute('aria-hidden', 'true');
      // 인라인 !important: 인쇄 중에 다시 재도 인쇄 규칙 .md > * { width:auto !important … }에 지지 않게
      probe.innerHTML = '<div class="table-wrap" style="min-width:0 !important;max-width:none !important;margin:0 !important;overflow:visible"></div>';
      document.body.appendChild(probe);
      const box = probe.firstChild;
      doc.querySelectorAll('.table-wrap > table').forEach((tb) => {
        let inset = 0;
        for (let el = tb.parentElement.parentElement; el && el !== doc; el = el.parentElement) {
          const cs = getComputedStyle(el);
          inset += parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
        }
        const t = document.createElement('template'); t.innerHTML = tb.outerHTML;
        t.content.querySelectorAll('img, video, picture, source').forEach((e) => e.remove());
        t.content.querySelectorAll('iframe, object, embed, audio').forEach((e) => ['src', 'srcdoc', 'data'].forEach((a) => e.removeAttribute(a)));
        box.style.setProperty('width', `${680 - inset}px`, 'important');
        box.replaceChildren(t.content);
        tb.parentElement.classList.toggle('print-wide', box.firstElementChild.getBoundingClientRect().width > 680 - inset + 0.5);
      });
      probe.remove();
    };
    markPrintWide();
    document.fonts?.addEventListener('loadingdone', markPrintWide);
    // 다이어그램 그리기. 화면 밝기를 바꾸면(PF.setMode → 'pf-modechange') 원문에서 새 밝기의 테마로 다시 그림
    const drawDiagrams = async () => {
      if (!figs.length) return;
      if (!window.mermaid) { errors.push('mermaid: 다이어그램 라이브러리(Mermaid)를 불러오지 못했습니다'); return; }
      // 어두운 페이지면 다이어그램도 어두운 테마(밝은 판이 화면에서 튀지 않게). 문서가 %%{init}%%으로 직접 테마를 정했으면 그 색이 읽히게 밝은 판 그대로
      const darkPage = /dark/.test(getComputedStyle(html).colorScheme) && ![...figs].some((f) => /%%\{\s*init/.test(f.querySelector('.mmd-src code')?.textContent || ''));
      if (darkPage) html.dataset.mmdDark = '1'; else delete html.dataset.mmdDark;
      const elk = await PF.mermaidElk();
      mermaid.initialize({ startOnLoad: false, theme: darkPage ? 'dark' : 'neutral', class: { hideEmptyMembersBox: true }, securityLevel: 'loose', fontFamily: 'Pretendard, sans-serif', ...(elk ? PF.ELK_CONFIG : {}) });
      figs.forEach((fig) => {                                               // 다시 그릴 때: 그린 SVG를 원문 글로 되돌림
        const div = fig.querySelector('.mermaid');
        if (!div.dataset.processed) return;
        div.removeAttribute('data-processed'); div.classList.remove('pf-mmd-error');
        const src = fig.querySelector('.mmd-src code')?.textContent || '';
        div.textContent = PF.mmdText ? PF.mmdText(src) : src;
      });
      try { await mermaid.run({ nodes: doc.querySelectorAll('.mermaid') }); }
      catch (err) { console.warn('[doc] Mermaid 렌더 오류:', err); errors.push(`mermaid: ${String(err?.message || err).split('\n')[0].slice(0, 160)}`); }
      figs.forEach((fig) => {
        const svg = fig.querySelector('.mermaid svg');
        if (!svg) { fig.querySelector('.mermaid')?.classList.add('pf-mmd-error'); return; }
        // 다이어그램 엔진(assets/diagram-tidy.js): 화살표를 직각으로·%% 격자·%% 화살표 줄 처리. 엔진이 없으면 Mermaid 그림 그대로
        try { PF.orthoEdges?.(svg, fig.querySelector('.mmd-src code')?.textContent || ''); }
        catch (err) { console.warn('[doc] 다이어그램 엔진 오류:', err); }
        const natural = svg.viewBox?.baseVal?.width || parseFloat(svg.style.maxWidth) || 0;
        if (natural) { svg.setAttribute('width', String(Math.ceil(natural))); svg.style.maxWidth = '100%'; svg.removeAttribute('height'); }
        svg.dataset.naturalWidth = String(natural);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', fig.dataset.label);
        svg.querySelectorAll('a[href], a[*|href]').forEach((a) => {           // Mermaid click 링크에도 같은 분류
          const h = a.getAttribute('href') || a.getAttribute('xlink:href') || '';
          if (/^https?:/i.test(h)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
        });
      });
    };
    await drawDiagrams();
    let redraw = Promise.resolve();                                         // 버튼을 빨리 여러 번 눌러도 차례로 한 번씩
    document.addEventListener('pf-modechange', () => { redraw = redraw.then(drawDiagrams); });

    // ⑧ 코드 하이라이트 + 접근성 (다이어그램 원문 pre는 제외)
    const LANG = { csharp: 'C#', cs: 'C#', js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', json: 'JSON', yaml: 'YAML', yml: 'YAML', xml: 'XML', html: 'HTML', css: 'CSS', python: 'Python', py: 'Python', bash: 'Shell', sh: 'Shell', powershell: 'PowerShell', hlsl: 'HLSL', shader: 'Shader', cpp: 'C++', c: 'C', lua: 'Lua' };
    doc.querySelectorAll('pre > code').forEach((el) => {
      if (el.closest('.mmd-src')) return;
      if (window.hljs) { try { hljs.highlightElement(el); } catch (_) { /* */ } }
      const lang = /language-([\w+#-]+)/.exec(el.className)?.[1]?.toLowerCase();
      const pre = el.parentElement;
      pre.tabIndex = 0; pre.setAttribute('role', 'region');
      pre.setAttribute('aria-label', lang && LANG[lang] ? `코드 (${LANG[lang]})` : '코드');
    });

    // ⑨ 인쇄용: 바깥 링크 각주 번호 + 문서 끝 링크 목록(§4-8). 화면에는 보이지 않음. ?pf-footnotes=0이면 끔
    if (Q.get('pf-footnotes') !== '0') {
      const urls = [];
      doc.querySelectorAll('a[href^="http"]').forEach((a) => {
        if (a.closest('.mmd')) return;
        let k = urls.indexOf(a.href);
        if (k < 0) { urls.push(a.href); k = urls.length - 1; }
        a.insertAdjacentHTML('afterend', `<sup class="print-only fn">[${k + 1}]</sup>`);
      });
      if (urls.length) doc.insertAdjacentHTML('beforeend', `<section class="print-only link-list"><p class="ll-title">${T('doc.links-list')}</p><ol>${urls.map((u) => `<li>${esc(u)}</li>`).join('')}</ol></section>`);
    }
    const here = new URL(location.href); here.hash = '';
    const deckAbs = new URL(deckUrl(), location.href).href;
    document.querySelector('.print-urls').innerHTML = `<p>${T('doc.print-web')}: ${esc(here.href)}</p><p>${T('name.deck')}: ${esc(deckAbs)}</p>`;

    // ⑩ 목차 현재 위치(스크롤 기준) + 레일 "지금 읽는 절"
    trackSection(headings.filter((h) => h.tagName === 'H2' || h.tagName === 'H3'));

    // ⑪ 이미지 크게 보기, 다이어그램 크게 보기(같은 페이지 dialog)
    doc.addEventListener('click', (e) => {
      const img = e.target.closest('img');
      if (img && !img.closest('a')) return zoom({ src: img.currentSrc || img.src, caption: img.alt });
      const zb = e.target.closest('.mmd-zoom');
      if (zb) { const svg = zb.closest('.mmd').querySelector('.mermaid svg'); if (svg) zoom({ svg, caption: zb.closest('.mmd').dataset.label }); return; }
      // 도표 자체를 눌러도 크게 보기(작은 설명 도표 .mmd-simple 포함, 장 머리 요약 도표 .mmd-summary 제외, 도표 안 링크·편집 모드 중에는 그대로)(직접 고침 11/21)
      const fig = e.target.closest('.mmd:not(.mmd-summary)');
      if (fig && e.target.closest('.mermaid') && !e.target.closest('a') && !document.body.classList.contains('pf-editing')) {
        const svg = fig.querySelector('.mermaid svg');
        if (svg) zoom({ svg, caption: fig.dataset.label });
      }
    });
    // 코드 오른쪽 흐림 표시: 가로로 더 있을 때만
    const fade = (pre) => pre.classList.toggle('fade-r', pre.scrollWidth > pre.clientWidth + 1 && pre.scrollLeft + pre.clientWidth < pre.scrollWidth - 1);
    const pres = [...doc.querySelectorAll('pre')].filter((x) => !x.closest('.mmd-src'));
    pres.forEach((pre) => { fade(pre); pre.addEventListener('scroll', () => fade(pre), { passive: true }); });
    addEventListener('resize', () => pres.forEach(fade));
  }

  // 다이어그램 이름(크게 보기 창 제목·스크린리더 이름)을 문서에서 찾음(직접 고침 11/21). 원문 accTitle이 있으면 그것이 먼저(호출하는 쪽).
  // ① 바로 위 문단이 굵은 글 한 줄이면(예: **① 같은 Core를 …**) 그 글에서 앞 원문자 번호만 뗀 것
  // ② 없으면 가장 가까운 위 제목(번호 뗌). 제목이 문제·선택·구현처럼 짧으면 장 제목(':' 앞)을 앞에 붙이고, 도표 종류를 뒤에 붙임
  function diagramLabel(fig, src) {
    const prev = fig.previousElementSibling;
    if (prev && prev.tagName === 'P') {
      const kids = [...prev.childNodes].filter((x) => !(x.nodeType === 3 && !x.textContent.trim()));
      if (kids.length === 1 && kids[0].nodeName === 'STRONG') {
        const t = kids[0].textContent.replace(/^[\s①-⑳]+/, '').trim();
        if (t) return t;
      }
    }
    const strip = (h) => htext(h).replace(/^\s*\d+(?:\.\d+)*\.?\s*/, '').trim();
    let sec = null, chap = null;
    for (let el = fig.previousElementSibling; el; el = el.previousElementSibling) {
      if (!sec && /^H[2-4]$/.test(el.tagName)) sec = el;
      if (el.tagName === 'H2') { chap = el; break; }
    }
    if (!sec) return '';
    let name = strip(sec);
    if (sec !== chap && chap && name.length <= 4) name = `${strip(chap).split(/[:—]/)[0].trim()} · ${name}`;
    const type = /^\s*(?:%%[^\n]*\n|---[\s\S]*?---\s*\n|\s*\n)*\s*(\w[\w-]*)/.exec(src)?.[1] || '';
    const KIND = { sequenceDiagram: '시퀀스 다이어그램', classDiagram: '클래스 다이어그램', stateDiagram: '상태 다이어그램', 'stateDiagram-v2': '상태 다이어그램', flowchart: '흐름도', graph: '흐름도', erDiagram: 'ERD' };
    return KIND[type] ? `${name} — ${KIND[type]}` : name;
  }

  function classifyMdLink(a, isRelative, decode) {
    const h = a.getAttribute('href') || '';
    if (/^mailto:/i.test(h)) return;                                  // 메일: target 없음
    if (h.startsWith('#')) return;                                    // 같은 문서 안: 같은 탭
    if (/^https?:/i.test(h) || /^[a-z][a-z0-9+.-]*:/i.test(h)) return markNewTab(a);   // 외부
    if (h.startsWith('/')) return markNewTab(a);
    if (!isRelative(h)) return;
    const k = h.indexOf('#');
    const path = decode(k < 0 ? h : h.slice(0, k)).replace(/^\.\//, '');
    const frag = k < 0 ? '' : h.slice(k);
    if (!path || path === p.doc) { a.setAttribute('href', frag || '#top'); return; }      // 자기 문서: 같은 문서 안 앵커
    const other = /^\.\.\/([^/]+)\/[^/]+\.md$/i.exec(path);
    if (other) { a.setAttribute('href', `${PF.docUrl(other[1])}${frag}`); return markNewTab(a); }   // 다른 프로젝트의 문서 → 그 상세 문서
    a.setAttribute('href', srcPath(path) + frag);                      // 그 밖의 상대 파일: 원문 파일
    markNewTab(a);
  }

  function trackSection(list) {
    const links = new Map([...document.querySelectorAll('#toc-links a')].map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const tocBox = document.getElementById('toc');
    // 지금 읽는 절은 왼쪽 목차 하이라이트로만 보여 줌(오른쪽 칸 "지금 읽는 절" 카드는 목차와 겹쳐서 뺌)
    let cur, t = 0;
    const update = () => {
      t = 0;
      let c = null;
      for (const h of list) { if (h.getBoundingClientRect().top <= 120) c = h; else break; }
      if (c === cur && cur !== undefined) return;
      cur = c;
      links.forEach((a) => { a.classList.remove('active'); a.removeAttribute('aria-current'); });
      if (!c) return;
      const a = links.get(c.id);
      if (a) {
        a.classList.add('active'); a.setAttribute('aria-current', 'location');
        if (tocBox && tocBox.scrollHeight > tocBox.clientHeight) {
          const top = a.offsetTop, bottom = top + a.offsetHeight;
          if (top < tocBox.scrollTop + 40 || bottom > tocBox.scrollTop + tocBox.clientHeight - 40) tocBox.scrollTop = Math.max(0, top - tocBox.clientHeight / 3);
        }
      }
    };
    addEventListener('scroll', () => { if (!t) t = setTimeout(update, 60); }, { passive: true });   // rAF 대신 setTimeout(가려진 창에서도 동작)
    addEventListener('resize', () => { cur = undefined; update(); });
    update();
  }

  function lightbox() {
    const dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', '크게 보기');
    dlg.innerHTML = `<div class="lb-stage"></div><p class="lb-cap"></p><button type="button" class="btn lb-close">${T('ui.close-esc')}</button>`;
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('.lb-close') || e.target.tagName === 'IMG') dlg.close(); });
    document.body.appendChild(dlg);
    return ({ src, svg, caption }) => {
      const st = dlg.querySelector('.lb-stage');
      st.className = svg ? 'lb-stage lb-svg' : 'lb-stage';
      st.innerHTML = '';
      if (svg) {
        // Mermaid는 svg 안 <style>을 "#<svg id> …"로 한정합니다. id를 지우면 색·선이 빠져 검은 상자가 되므로, 복제본에 새 id를 주고 그 스타일의 id도 같이 바꿈
        const c = svg.cloneNode(true);
        if (svg.id) {
          const nid = `${svg.id}-lb`;
          const own = new RegExp('#' + svg.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'g');
          c.id = nid;
          c.querySelectorAll('style').forEach((s) => { s.textContent = s.textContent.replace(own, `#${nid}`); });
        }
        c.style.maxWidth = 'none'; st.appendChild(c);
      }
      else { const im = new Image(); im.src = src; im.alt = caption || ''; st.appendChild(im); }
      dlg.querySelector('.lb-cap').textContent = caption || '';
      dlg.showModal();
    };
  }

  function ready() {
    // 목차 서랍(< 1200px): 같은 탭, 고르면 닫힘
    const dlg = document.querySelector('.toc-dialog');
    document.querySelector('.fab-toc').addEventListener('click', () => dlg.showModal());
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('.dlg-close') || e.target.closest('a')) dlg.close(); });

    // 딥링크: #sec=<절 제목> → 정규 앵커 #<slug>로 바꾸고 도착 강조, 그냥 #<slug>(슬라이드·옛 주소)도 도착 강조
    const flash = (el) => { el.classList.add('arrive'); setTimeout(() => el.classList.remove('arrive'), 2100); };
    const arrive = (el) => {
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
      flash(el); hold(el);
    };
    const hashText = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return location.hash.slice(1); } };
    const raw = hashText();
    if (raw.startsWith('sec=')) {
      const el = window.PFDoc?.resolve(raw.slice(4));
      if (el) { history.replaceState(null, '', `#${el.id}`); arrive(el); } else console.warn('[doc] #sec= 제목을 찾지 못함 → 맨 위:', raw.slice(4));
    } else if (raw) {
      const el = document.getElementById(raw);
      if (el) arrive(el); else if (raw !== 'top') console.warn('[doc] 조각에 맞는 제목이 없음 → 맨 위:', raw);
    }
    // 같은 문서 안 이동(목차·앵커): 브라우저가 옮긴 뒤 도착 강조 + 붙잡기
    addEventListener('hashchange', () => { const el = document.getElementById(hashText()); if (el && el.matches('h1,h2,h3,h4,h5,h6')) { flash(el); hold(el); } });
  }

  // 도착한 제목 붙잡기 — md 그림에는 크기 정보가 없어서, 제목에 도착한 뒤 위쪽 그림이 늦게 들어오면 제목이 화면 아래로 밀립니다
  //   (브라우저 스크롤 고정이 바로 위 그림 문단을 기준으로 잡을 때. doc.css의 overflow-anchor: none과 함께 막음. 스크롤 고정이 없는 브라우저도 이것으로 막음).
  //   그림이 들어오거나 본문 높이가 바뀔 때마다 제목을 제자리로 되돌리고, 읽는 사람이 직접 움직이면(휠·터치·키·마우스) 바로 놓습니다.
  //   그림이 다 들어오면 또는 30초가 지나면 끝. rAF를 쓰지 않음(가려진 창에서도 동작).
  function hold(el) {
    releaseHold?.();
    const md = document.getElementById('doc');
    if (!md) return;
    const pending = () => [...md.querySelectorAll('img')].some((i) => !i.complete);
    if (!pending()) return;
    const USER = ['wheel', 'touchstart', 'keydown', 'pointerdown', 'mousedown'];
    let ro = null, timer = 0;
    const stop = () => {
      md.removeEventListener('load', onMedia, true); md.removeEventListener('error', onMedia, true);
      ro?.disconnect(); clearTimeout(timer);
      USER.forEach((t) => removeEventListener(t, stop, true));
      releaseHold = null;
    };
    const fix = () => {
      const want = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      if (Math.abs(el.getBoundingClientRect().top - want) > 1) el.scrollIntoView({ block: 'start', behavior: 'instant' });
      if (!pending()) stop();
    };
    function onMedia(e) { if (e.target instanceof HTMLImageElement) fix(); }
    md.addEventListener('load', onMedia, true); md.addEventListener('error', onMedia, true);
    if ('ResizeObserver' in window) {                                  // 첫 알림(관찰 시작)은 건너뜀 → 목차 클릭의 부드러운 스크롤을 끊지 않음
      let first = true;
      ro = new ResizeObserver(() => { if (first) { first = false; return; } fix(); });
      ro.observe(md);
    }
    USER.forEach((t) => addEventListener(t, stop, { capture: true, passive: true }));
    timer = setTimeout(stop, 30000);
    releaseHold = stop;
  }

  // 준비 신호(점검 하네스용): 문서·Mermaid·코드 처리와 글꼴이 끝난 뒤
  function done() {
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
      html.dataset.docReady = '1'; resolveReady(report());
      if (new URLSearchParams(location.search).get('pf-audit') === '1') writeAudit();
    });
  }
  // ?pf-audit=1(headless 점검용): 그림까지 받은 뒤(최대 15초) #pf-audit에 report()의 base64 JSON — 슬라이드·포트폴리오 페이지와 같은 형식
  async function writeAudit() {
    const imgs = [...document.querySelectorAll('#doc img')];
    imgs.forEach((i) => { i.loading = 'eager'; });
    await Promise.race([Promise.all(imgs.map((i) => i.complete ? 0 : new Promise((r) => { i.addEventListener('load', r); i.addEventListener('error', r); }))), sleep(15000)]);
    let pre = document.getElementById('pf-audit');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'pf-audit'; pre.hidden = true; pre.style.display = 'none'; document.body.appendChild(pre); }
    const bytes = new TextEncoder().encode(JSON.stringify(report()));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    pre.textContent = btoa(bin);
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
})();
