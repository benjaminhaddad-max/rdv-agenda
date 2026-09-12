export const DIPLOMA_SITE = "https://diploma-sante.fr"

export const DIPLOMA_HEADER_HTML = `
  <!-- HEADER -->
  <header style="position:sticky;top:0;z-index:50;padding:14px clamp(12px,1.4vw,24px) 0">
    <div style="max-width:1560px;margin:0 auto;border-radius:26px;box-shadow:0 18px 44px rgba(9,26,42,.26)">
    <div style="background:linear-gradient(90deg,#4fabdb 0%,#d3ab67 45%,rgba(211,171,103,0) 100%) bottom/100% 2px no-repeat,#12314d;border-radius:26px">
      <div style="padding:0 clamp(16px,1.5vw,26px);display:flex;align-items:center;gap:clamp(8px,1vw,18px);height:70px">
        <a href="https://diploma-sante.fr/" style="display:flex;align-items:center;flex:none;margin-right:clamp(4px,1vw,14px)">
          <img src="/event-landing/logo-diploma-blanc.svg" alt="Diploma Santé" style="height:30px;max-width:172px;object-fit:contain;display:block"/>
        </a>
        <details class="hd-burger nav-drop" style="display:none;position:relative;flex:none;margin-right:auto">
          <summary style="width:42px;height:42px;border-radius:999px;border:1px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          </summary>
          <div style="position:absolute;z-index:60;top:calc(100% + 13px);left:0;background:#12314d;border-radius:24px;padding:20px 24px;min-width:260px;box-shadow:0 26px 54px rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column">
            <a href="https://diploma-sante.fr/nos-preparations/" style="font-family:'Clash Display',sans-serif;font-weight:600;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;padding:10px 0;color:#fff">Nos prépas</a>
            <a href="https://diploma-sante.fr/notre-methode/" style="font-family:'Clash Display',sans-serif;font-weight:600;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;padding:10px 0;color:#fff">L’école</a>
            <a href="https://diploma-sante.fr/nos-resultats/" style="font-family:'Clash Display',sans-serif;font-weight:600;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;padding:10px 0;color:#fff">Résultats</a>
            <a href="https://diploma-sante.fr/etudes-de-sante/reforme-2027/" style="font-family:'Clash Display',sans-serif;font-weight:600;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;padding:10px 0;color:#fff">S'informer</a>
            <a href="https://diploma-sante.fr/parcoursup-sante/calendrier/" style="font-family:'Clash Display',sans-serif;font-weight:600;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;padding:10px 0;color:#fff">Parcoursup</a>
            <a href="https://diploma-sante.fr/annales-et-qcm/" style="font-family:'Clash Display',sans-serif;font-weight:600;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;padding:10px 0;color:#fff">Ressources</a>
          </div>
        </details>
        <nav class="hd-nav" style="display:flex;align-items:center;gap:1px;margin-right:auto;flex-wrap:nowrap;flex:0 0 auto">
        <details class="nav-drop" style="position:relative">
          <summary class="hd-sum" style="color:#fff;padding:9px clamp(6px,0.75vw,11px);border-radius:999px;font-family:'Clash Display',sans-serif;font-size:clamp(11.5px,0.92vw,12.5px);letter-spacing:0.06em;text-transform:uppercase;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:background-color .18s;cursor:pointer">Nos prépas
            <svg class="nd-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="3.2" stroke-linecap="round" style="transition:transform .2s;flex:none"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div style="position:absolute;z-index:60;top:calc(100% + 13px);left:0;background:#12314d;border-radius:28px;padding:34px 36px;display:flex;gap:clamp(30px,3vw,54px);min-width:760px;box-shadow:0 26px 54px rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.08)">
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Dès le lycée</span>
              <a href="https://diploma-sante.fr/premiere-elite/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Première Élite</a>
              <a href="https://diploma-sante.fr/terminale-sante/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Terminale Santé</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Prépas universitaires</span>
              <a href="https://diploma-sante.fr/prepa-pass/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Prépa PASS</a>
              <a href="https://diploma-sante.fr/prepa-las/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Prépa LAS</a>
              <a href="https://diploma-sante.fr/prepa-lsps/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Prépa LSPS</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">France &amp; Europe</span>
              <a href="https://diploma-sante.fr/prepa-paes-fr-eu/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">PAES FR/EU</a>
            </div>
            <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:24px;min-width:220px;max-width:250px;display:flex;flex-direction:column">
              <span style="font-family:'Clash Display',sans-serif;font-size:10px;letter-spacing:0.11em;text-transform:uppercase;color:#4fabdb;font-weight:600;margin-bottom:8px">Rentrée 2026</span>
              <span style="font-family:'PP Pangaia',serif;font-weight:700;font-size:18.5px;color:#fff;line-height:1.2;margin-bottom:10px">Quelle prépa pour votre profil ?</span>
              <span style="font-size:13px;color:#a3cceb;line-height:1.55;margin-bottom:18px;flex:1">Du lycée à la réorientation, six parcours distincts.</span>
              <a href="https://diploma-sante.fr/nos-preparations/" style="display:inline-flex;align-items:center;gap:7px;font-family:'Clash Display',sans-serif;font-weight:600;font-size:12.5px;color:#d3ab67">Comparer
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </a>
            </div>
          </div>
        </details>
        <details class="nav-drop" style="position:relative">
          <summary class="hd-sum" style="color:#fff;padding:9px clamp(6px,0.75vw,11px);border-radius:999px;font-family:'Clash Display',sans-serif;font-size:clamp(11.5px,0.92vw,12.5px);letter-spacing:0.06em;text-transform:uppercase;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:background-color .18s;cursor:pointer">L'école
            <svg class="nd-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="3.2" stroke-linecap="round" style="transition:transform .2s;flex:none"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div style="position:absolute;z-index:60;top:calc(100% + 13px);left:0;background:#12314d;border-radius:28px;padding:34px 36px;display:flex;gap:clamp(30px,3vw,54px);min-width:680px;box-shadow:0 26px 54px rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.08)">
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Qui sommes-nous</span>
              <a href="https://diploma-sante.fr/notre-histoire/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Notre histoire</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Pédagogie</span>
              <a href="https://diploma-sante.fr/notre-methode/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Notre méthode</a>
              <a href="https://diploma-sante.fr/coaching-hermione/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Coaching Hermione</a>
              <a href="https://diploma-sante.fr/nos-outils-numeriques/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Diploma Lab</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Équipe</span>
              <a href="https://diploma-sante.fr/equipe-pedagogique/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">L’équipe</a>
              <a href="https://diploma-sante.fr/equipe-pedagogique/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Les professeurs</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Campus</span>
              <a href="https://diploma-sante.fr/campus/quai-de-la-rapee/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Quai de la Rapée</a>
              <a href="https://diploma-sante.fr/campus/ledru-rollin/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Ledru-Rollin</a>
              <a href="https://diploma-sante.fr/campus/lauriston/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Lauriston</a>
            </div>
          </div>
        </details>
        <details class="nav-drop" style="position:relative">
          <summary class="hd-sum" style="color:#fff;padding:9px clamp(6px,0.75vw,11px);border-radius:999px;font-family:'Clash Display',sans-serif;font-size:clamp(11.5px,0.92vw,12.5px);letter-spacing:0.06em;text-transform:uppercase;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:background-color .18s;cursor:pointer">Résultats
            <svg class="nd-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="3.2" stroke-linecap="round" style="transition:transform .2s;flex:none"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div style="position:absolute;z-index:60;top:calc(100% + 13px);left:0;background:#12314d;border-radius:28px;padding:34px 36px;display:flex;gap:clamp(30px,3vw,54px);min-width:470px;box-shadow:0 26px 54px rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.08)">
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Nos performances</span>
              <a href="https://diploma-sante.fr/chiffres-cles/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Chiffres clés</a>
              <a href="https://diploma-sante.fr/nos-resultats/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Nos résultats</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Ils en parlent</span>
              <a href="https://diploma-sante.fr/avis/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Avis</a>
              <a href="https://diploma-sante.fr/temoignages-video/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Témoignages vidéo</a>
            </div>
            <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:24px;min-width:220px;max-width:250px;display:flex;flex-direction:column">
              <span style="font-family:'Clash Display',sans-serif;font-size:10px;letter-spacing:0.11em;text-transform:uppercase;color:#4fabdb;font-weight:600;margin-bottom:8px">Session 2025</span>
              <span style="font-family:'PP Pangaia',serif;font-weight:700;font-size:18.5px;color:#fff;line-height:1.2;margin-bottom:10px">78% d’admissibles</span>
              <span style="font-size:13px;color:#a3cceb;line-height:1.55;margin-bottom:18px;flex:1">contre 29,6% au niveau national.</span>
              <a href="https://diploma-sante.fr/nos-resultats/" style="display:inline-flex;align-items:center;gap:7px;font-family:'Clash Display',sans-serif;font-weight:600;font-size:12.5px;color:#d3ab67">Voir le détail
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </a>
            </div>
          </div>
        </details>
        <details class="nav-drop" style="position:relative">
          <summary class="hd-sum" style="color:#fff;padding:9px clamp(6px,0.75vw,11px);border-radius:999px;font-family:'Clash Display',sans-serif;font-size:clamp(11.5px,0.92vw,12.5px);letter-spacing:0.06em;text-transform:uppercase;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:background-color .18s;cursor:pointer">S'informer
            <svg class="nd-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="3.2" stroke-linecap="round" style="transition:transform .2s;flex:none"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div style="position:absolute;z-index:60;top:calc(100% + 13px);left:50%;transform:translateX(-50%);background:#12314d;border-radius:28px;padding:34px 36px;display:flex;gap:clamp(30px,3vw,54px);min-width:850px;box-shadow:0 26px 54px rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.08)">
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Voies d’accès</span>
              <a href="https://diploma-sante.fr/etudes-de-sante/pass/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Le PASS</a>
              <a href="https://diploma-sante.fr/etudes-de-sante/las/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Les LAS</a>
              <a href="https://diploma-sante.fr/etudes-de-sante/lsps/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">La LSPS</a>
              <a href="https://diploma-sante.fr/etudes-de-sante/pass-ou-las/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">PASS ou LAS</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Les filières</span>
              <a href="https://diploma-sante.fr/etudes-de-sante/medecine/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Médecine</a>
              <a href="https://diploma-sante.fr/etudes-de-sante/maieutique/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Maïeutique</a>
              <a href="https://diploma-sante.fr/etudes-de-sante/odontologie/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Odontologie</a>
              <a href="https://diploma-sante.fr/etudes-de-sante/pharmacie/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Pharmacie</a>
              <a href="https://diploma-sante.fr/etudes-de-sante/kinesitherapie/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Kinésithérapie</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Les facultés</span>
              <a href="https://diploma-sante.fr/facultes-ile-de-france/paris-cite/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Paris Cité</a>
              <a href="https://diploma-sante.fr/facultes-ile-de-france/sorbonne-universite/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Sorbonne Université</a>
              <a href="https://diploma-sante.fr/facultes-ile-de-france/sorbonne-paris-nord/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Sorbonne Paris Nord</a>
              <a href="https://diploma-sante.fr/facultes-ile-de-france/upec/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">UPEC</a>
              <a href="https://diploma-sante.fr/facultes-ile-de-france/paris-saclay/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Paris-Saclay</a>
              <a href="https://diploma-sante.fr/facultes-ile-de-france/uvsq/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">UVSQ</a>
            </div>
            <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:24px;min-width:220px;max-width:250px;display:flex;flex-direction:column">
              <span style="font-family:'Clash Display',sans-serif;font-size:10px;letter-spacing:0.11em;text-transform:uppercase;color:#4fabdb;font-weight:600;margin-bottom:8px">À la une</span>
              <span style="font-family:'PP Pangaia',serif;font-weight:700;font-size:18.5px;color:#fff;line-height:1.2;margin-bottom:10px">La réforme 2027</span>
              <span style="font-size:13px;color:#a3cceb;line-height:1.55;margin-bottom:18px;flex:1">Vœu principal unique et sous-vœu disciplinaire : ce qui change.</span>
              <a href="https://diploma-sante.fr/etudes-de-sante/reforme-2027/" style="display:inline-flex;align-items:center;gap:7px;font-family:'Clash Display',sans-serif;font-weight:600;font-size:12.5px;color:#d3ab67">Comprendre
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </a>
            </div>
          </div>
        </details>
        <details class="nav-drop" style="position:relative">
          <summary class="hd-sum" style="color:#fff;padding:9px clamp(6px,0.75vw,11px);border-radius:999px;font-family:'Clash Display',sans-serif;font-size:clamp(11.5px,0.92vw,12.5px);letter-spacing:0.06em;text-transform:uppercase;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:background-color .18s;cursor:pointer">Parcoursup
            <svg class="nd-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="3.2" stroke-linecap="round" style="transition:transform .2s;flex:none"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div style="position:absolute;z-index:60;top:calc(100% + 13px);left:50%;transform:translateX(-50%);background:#12314d;border-radius:28px;padding:34px 36px;display:flex;gap:clamp(30px,3vw,54px);min-width:760px;box-shadow:0 26px 54px rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.08)">
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Le calendrier</span>
              <a href="https://diploma-sante.fr/parcoursup-sante/calendrier/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Calendrier Parcoursup<span style="display:block;font-size:12.5px;color:#a3cceb;margin-top:3px;line-height:1.4">Les 5 étapes de l’année</span></a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Candidater</span>
              <a href="https://diploma-sante.fr/parcoursup-sante/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Vue d’ensemble</a>
              <a href="https://diploma-sante.fr/parcoursup-sante/attendus/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Attendus</a>
              <a href="https://diploma-sante.fr/parcoursup-sante/specialites-lycee/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Spécialités au lycée</a>
              <a href="https://diploma-sante.fr/parcoursup-sante/projet-de-formation-motive/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Projet de formation motivé</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Résultats</span>
              <a href="https://diploma-sante.fr/parcoursup-sante/taux-acces-idf/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Taux d’accès en IDF</a>
              <a href="https://diploma-sante.fr/parcoursup-sante/listes-attente/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Listes d’attente</a>
              <a href="https://diploma-sante.fr/parcoursup-sante/phase-complementaire/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Phase complémentaire</a>
              <a href="https://diploma-sante.fr/parcoursup-sante/pas-admis-en-sante/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Pas de proposition</a>
            </div>
            <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:24px;min-width:220px;max-width:250px;display:flex;flex-direction:column">
              <span style="font-family:'Clash Display',sans-serif;font-size:10px;letter-spacing:0.11em;text-transform:uppercase;color:#4fabdb;font-weight:600;margin-bottom:8px">Guide gratuit</span>
              <span style="font-family:'PP Pangaia',serif;font-weight:700;font-size:18.5px;color:#fff;line-height:1.2;margin-bottom:10px">Réussir Parcoursup</span>
              <span style="font-size:13px;color:#a3cceb;line-height:1.55;margin-bottom:18px;flex:1">Stratégie de vœux, attendus, gestion de l’attente.</span>
              <a href="https://diploma-sante.fr/brochure/" style="display:inline-flex;align-items:center;gap:7px;font-family:'Clash Display',sans-serif;font-weight:600;font-size:12.5px;color:#d3ab67">Télécharger
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </a>
            </div>
          </div>
        </details>
        <details class="nav-drop" style="position:relative">
          <summary class="hd-sum" style="color:#fff;padding:9px clamp(6px,0.75vw,11px);border-radius:999px;font-family:'Clash Display',sans-serif;font-size:clamp(11.5px,0.92vw,12.5px);letter-spacing:0.06em;text-transform:uppercase;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:background-color .18s;cursor:pointer">Ressources
            <svg class="nd-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="3.2" stroke-linecap="round" style="transition:transform .2s;flex:none"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div style="position:absolute;z-index:60;top:calc(100% + 13px);right:0;background:#12314d;border-radius:28px;padding:34px 36px;display:flex;gap:clamp(30px,3vw,54px);min-width:940px;box-shadow:0 26px 54px rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.08)">
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Supports</span>
              <a href="https://diploma-sante.fr/fiches-de-cours-pass-las/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Fiches de cours PASS/LAS</a>
              <a href="https://diploma-sante.fr/annales-et-qcm/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Annales et QCM</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Outils</span>
              <a href="https://diploma-sante.fr/simulateur-pass/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Simulateur PASS</a>
              <a href="https://diploma-sante.fr/glossaire-etudes-sante/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Glossaire</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Méthodes de travail</span>
              <a href="https://diploma-sante.fr/methodes-de-travail/methode-des-j/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Méthode des J</a>
              <a href="https://diploma-sante.fr/methodes-de-travail/flashcards/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Flashcards</a>
              <a href="https://diploma-sante.fr/methodes-de-travail/cornell/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Méthode Cornell</a>
              <a href="https://diploma-sante.fr/methodes-de-travail/deep-work/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Deep Work</a>
              <a href="https://diploma-sante.fr/methodes-de-travail/gestion-du-stress/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Gestion du stress</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Tarifs</span>
              <a href="https://diploma-sante.fr/tarifs/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Tarifs</a>
              <a href="https://diploma-sante.fr/financement/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Financement</a>
              <a href="https://diploma-sante.fr/etudiant-solidaire/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Étudiant solidaire</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Nous rencontrer</span>
              <a href="https://diploma-sante.fr/evenements/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Événements</a>
              <a href="https://diploma-sante.fr/journees-portes-ouvertes/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Journées portes ouvertes</a>
              <a href="https://diploma-sante.fr/webinaires/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Webinaires</a>
            </div>
            <div style="min-width:0">
              <span class="nd-col" style="display:block;color:#d3ab67;font-family:'Clash Display',sans-serif;font-size:11.5px;letter-spacing:0.11em;text-transform:uppercase;margin:0 0 16px;font-weight:600">Contact</span>
              <a href="https://diploma-sante.fr/contact/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Contact</a>
              <a href="https://diploma-sante.fr/brochure/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">Brochure</a>
              <a href="https://diploma-sante.fr/faq/" class="nd-item" style="display:block;font-size:14.5px;padding:8px 0;color:#fff;border-radius:8px;transition:color .16s">FAQ</a>
            </div>
          </div>
        </details>
        </nav>
        <div style="display:flex;align-items:center;gap:9px;flex:none">
          <a href="tel:+33176410173" class="hd-phone" aria-label="+33 1 76 41 01 73" style="width:38px;height:38px;border-radius:999px;border:1px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex:none;transition:background-color .18s,border-color .18s">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d3ab67" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </a>
          <a href="https://diploma-sante.fr/brochure/" class="hd-ghost" style="display:inline-flex;align-items:center;gap:7px;border:1.5px solid rgba(255,255,255,.3);color:#fff;font-family:'Clash Display',sans-serif;font-weight:600;font-size:12.5px;padding:10px 18px;border-radius:999px;white-space:nowrap;transition:background-color .18s,border-color .18s,color .18s">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M12 3v12M7 11l5 5 5-5M5 21h14"/></svg>
            <span class="hd-ghost-label">Brochure</span>
          </a>
          <a href="https://diploma-sante.fr/candidature/" class="hd-gold" style="background:#d3ab67;color:#12314d;font-family:'Clash Display',sans-serif;font-weight:600;font-size:12.5px;padding:11px 22px;border-radius:999px;white-space:nowrap;transition:background-color .18s">Candidater</a>
          <a href="https://plateforme.diploma-sante.fr" class="hd-space" style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);color:#fff;font-size:12.5px;font-weight:500;padding:9px 16px 9px 10px;border-radius:999px;white-space:nowrap;transition:background-color .18s,border-color .18s">
            <span style="width:25px;height:25px;border-radius:50%;background:#4fabdb;display:flex;align-items:center;justify-content:center;flex:none">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#12314d" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </span>
            <span class="hd-space-label">Espace étudiant</span>
          </a>
        </div>
      </div>
    </div>
    </div>
  </header>
`

export const DIPLOMA_FOOTER_HTML = `
  <!-- FOOTER -->
  <footer style="background:#12314d">
    <div style="max-width:1440px;margin:0 auto;padding:60px 32px 28px;display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:40px;border-bottom:1px solid rgba(255,255,255,.12)">
      <div>
        <img src="/event-landing/logo-diploma-blanc.svg" alt="Diploma Santé" style="height:28px;margin-bottom:16px"/>
        <p style="font-size:13.5px;color:#a3cceb;max-width:34ch;line-height:1.6">La Prépa Médecine avec 78% de taux de réussite. Établissement privé.</p>
      </div>
      <div>
        <span class="nd-col" style="display:block;color:#d3ab67;font-size:11px;letter-spacing:0.08em;margin:0 0 14px;font-weight:600">Contact</span>
        <p style="font-size:14px;color:#fff;margin:0 0 6px">+33 1 76 41 01 73</p>
        <p style="font-size:14px;color:#fff;margin:0 0 6px">contact@diploma-sante.fr</p>
        <p style="font-size:12.5px;color:#a3cceb;margin:0">Du lundi au vendredi de 9h00 à 13h00 et 14h00 à 18h00</p>
      </div>
      <div>
        <span class="nd-col" style="display:block;color:#d3ab67;font-size:11px;letter-spacing:0.08em;margin:0 0 14px;font-weight:600">Nos campus</span>
        <p style="font-size:14px;color:#fff;margin:0 0 6px">100 quai de la Rapée 75012 PARIS</p>
        <p style="font-size:14px;color:#fff;margin:0 0 6px">85 avenue Ledru Rollin 75012 PARIS</p>
        <p style="font-size:14px;color:#fff;margin:0">29 rue Lauriston 75016 PARIS</p>
      </div>
    </div>
    <div style="max-width:1440px;margin:0 auto;padding:20px 32px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <p style="font-size:12px;color:#a3cceb;margin:0">© 2026 Diploma Santé — Établissement privé.</p>
      <div style="display:flex;gap:18px">
        <a href="https://diploma-sante.fr/mentions-legales/" style="font-size:12px;color:#a3cceb">Mentions légales</a>
        <a href="https://diploma-sante.fr/politique-de-confidentialite/" style="font-size:12px;color:#a3cceb">Confidentialité</a>
      </div>
    </div>
  </footer>
`
