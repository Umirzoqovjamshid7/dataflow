import React, {useEffect, useRef, useState} from "react";
import BrandMark from "./BrandMark";
import {navigationItems, routes} from "../navigation";
import styles from "./AppLayout.module.css";

export function Sidebar({page, role, open, onNavigate, onClose, onLogout, logoutLabel}) {
  const ref=useRef(null);
  useEffect(()=>{
    if (!open || !window.matchMedia("(max-width: 760px)").matches) return;
    const previous=document.activeElement;
    ref.current?.querySelector("button,a")?.focus();
    function trap(event) {
      if(event.key === "Escape") {event.preventDefault();onClose();return;}
      if(event.key !== "Tab") return;
      const items=[...ref.current.querySelectorAll("a,button")];
      const first=items[0], last=items.at(-1);
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    }
    ref.current.addEventListener("keydown",trap);
    const target=ref.current;
    return ()=>{target.removeEventListener("keydown",trap);previous?.focus();};
  },[open,onClose]);
  function follow(event,key,hash="") {
    if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button!==0) return;
    event.preventDefault();onNavigate(key,hash);onClose();
  }
  return <aside ref={ref} id="dataflow-sidebar" className={styles.sidebar} inert={!open ? true : undefined} aria-label="DataFlow navigatsiya">
    <div className={styles.brand}><BrandMark/><div><strong>DataFlow</strong><small>BUSINESS ANALYTICS</small></div></div>
    <button className={styles.close} type="button" aria-label="Navigatsiyani yopish" onClick={onClose}>×</button>
    <nav aria-label="Asosiy navigatsiya">
      <span className={styles.navLabel}>WORKSPACE</span>
      {navigationItems(role).map(item=><React.Fragment key={item.key}>
        <a href={item.path} aria-current={page===item.key ? "page" : undefined} className={page===item.key ? styles.active : ""} onClick={event=>follow(event,item.key)}><span aria-hidden="true">{item.icon}</span>{item.title}</a>
        {item.key==="dashboard" && <a href="/dashboard#campaigns" onClick={event=>follow(event,"dashboard","campaigns")}><span aria-hidden="true">◫</span>Kampaniyalar</a>}
      </React.Fragment>)}
    </nav>
    <div className={styles.sidebarFooter}><span>DataFlow workspace</span><button type="button" onClick={onLogout}>{logoutLabel}</button></div>
  </aside>;
}

export function Header({page,user,onToggle,open}) {
  const info=routes[page] || routes.dashboard;
  return <header className={styles.header}>
    <div className={styles.heading}><button type="button" className={styles.toggle} aria-label="Navigatsiyani ochish yoki yopish" aria-expanded={open} aria-controls="dataflow-sidebar" onClick={onToggle}>☰</button><div><span className={styles.eyebrow}>DATAFLOW / ANALYTICS</span><h1>{info.title}</h1><p>{info.subtitle}</p></div></div>
    <div className={styles.account}><span className={styles.avatar} aria-hidden="true">{(user.full_name || user.email || "D").slice(0,1).toUpperCase()}</span><div><strong>{user.full_name || "DataFlow"}</strong><small>{user.email}</small></div></div>
  </header>;
}

export function PageContainer({children,className="",...props}) {
  return <div className={`page-container ${className}`} {...props}>{children}</div>;
}

export default function AppLayout({page,user,onNavigate,onLogout,logoutLabel,children}) {
  const [open,setOpen]=useState(()=>window.matchMedia("(min-width: 761px)").matches);
  useEffect(()=>{
    const media=window.matchMedia("(min-width: 761px)");
    const resize=()=>setOpen(media.matches);
    media.addEventListener("change",resize);
    return ()=>media.removeEventListener("change",resize);
  },[]);
  // Stable callback avoids refocusing the drawer whenever its parent renders.
  const close=React.useCallback(()=>{if(window.matchMedia("(max-width: 760px)").matches)setOpen(false);},[]);
  return <div className={`${styles.root} ${open ? styles.open : styles.closed}`}>
    <a className={styles.skip} href="#dataflow-main">Asosiy mazmunga o'tish</a>
    {open && <button className={styles.overlay} aria-label="Navigatsiyani yopish" onClick={()=>setOpen(false)}/>}
    <Sidebar page={page} role={user.role} open={open} onNavigate={onNavigate} onClose={close} onLogout={onLogout} logoutLabel={logoutLabel}/>
    <main id="dataflow-main" className={styles.main} tabIndex={-1}><Header page={page} user={user} open={open} onToggle={()=>setOpen(value=>!value)}/><div className={styles.content}>{children}</div></main>
  </div>;
}
