const root = dv.container.createDiv({cls:"wy-shell"});
const day = () => new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Shanghai"}).format(new Date());
function week() {
  const d=new Date(day()+"T12:00:00Z");
  d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return d.toISOString().slice(0,10);
}
const data = "工作看板/运行文件/数据/";
const daily = () => "工作看板/每日与每周/"+day()+".md";
const weekly = () => "工作看板/每日与每周/周-"+week()+".md";
const read = async p => {
  const f=app.vault.getFileByPath(p);
  return f ? app.vault.cachedRead(f) : "";
};
const append = async (p, heading, line) => {
  let f = app.vault.getFileByPath(p);
  if (!f) {
    try { await app.vault.create(p, heading+"\n\n"); }
    catch (e) { if (!app.vault.getFileByPath(p)) throw e; }
    f=app.vault.getFileByPath(p);
  }
  await app.vault.process(f, old => {
    const eol=old.includes("\r\n")?"\r\n":"\n";
    return old+(old&&!old.endsWith("\n")?eol:"")+line+eol;
  });
};
const run = async (el, fn) => {
  el.disabled=true;
  try { await fn(); } catch (e) { status.setText("操作未完成："+e.message); }
  finally { el.disabled=false; }
};
const button = (box,label,fn) => {
  const b=box.createEl("button",{text:label});
  b.onclick=()=>run(b,fn);
  return b;
};
const link = (box,p,label) => {
  const el=box.createEl("a",{text:label,attr:{href:p}});
  el.onclick=e=>{e.preventDefault(); app.workspace.openLinkText(p,"");};
};
const external = (box,url,label) => {
  try {
    if (new URL(url).protocol==="https:") box.createEl("a",{text:label,attr:{href:url,target:"_blank",rel:"noopener noreferrer"}});
  } catch {}
};
const header=root.createDiv({cls:"wy-head"});
header.createEl("h1",{text:input.page});
const status=header.createSpan({cls:"wy-state"});
button(header,"↻ 刷新",async()=>{ await render(); status.setText("已刷新 "+new Date().toLocaleTimeString("zh-CN",{hour12:false})); });
if(input.page!=="工作看板") link(header,"工作看板","返回总看板");
const grid=root.createDiv({cls:"wy-grid"});
const card=(title,tone="")=>{
  const c=grid.createDiv({cls:"wy-card "+tone});
  c.createEl("h2",{text:title});
  return c;
};
const quiet=(c,text)=>c.createEl("p",{text,cls:"wy-muted"});
function rows(md) {
  let fence=null;
  return md.split("\n").flatMap((s,i)=>{
    const marker=s.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if(marker){
      if(!fence) fence=marker[1];
      else if(marker[1][0]===fence[0] && marker[1].length>=fence.length && !marker[2].trim()) fence=null;
      return [];
    }
    const m=!fence && s.match(/^\s*- \[([ xX])\] (.+?)\r?$/);
    return m?[{line:s,i,done:m[1]!==" ",text:m[2]}]:[];
  });
}
function field(c, placeholder, label, submit) {
  const form=c.createEl("form");
  const entry=form.createEl("input",{attr:{placeholder,"aria-label":placeholder,required:true}});
  const b=form.createEl("button",{text:label,attr:{type:"submit"}});
  form.onsubmit=e=>{
    e.preventDefault();
    run(b,async()=>{const value=entry.value.trim(); if(!value)return; await submit(value); entry.value=""; await render();});
  };
}
function tasks(c,path,md) {
  const ts=rows(md);
  quiet(c,ts.length ? `${ts.filter(t=>t.done).length} / ${ts.length} 已完成` : "暂无待办");
  for(const t of ts) {
    const label=c.createEl("label",{cls:"wy-task"});
    const b=label.createEl("input",{attr:{type:"checkbox"}});
    b.checked=t.done;
    label.createSpan({text:t.text});
    b.onchange=async()=>{
      const desired=b.checked;
      try {
        await app.vault.process(app.vault.getFileByPath(path), old=>{
          const lines=old.split("\n");
          if(lines[t.i]!==t.line) throw Error("笔记已修改，请刷新后再勾选");
          lines[t.i]=t.line.replace(/\[[ xX]\]/,desired?"[x]":"[ ]");
          return lines.join("\n");
        });
        await render();
      } catch(e) { b.checked=t.done; status.setText(e.message); }
    };
  }
  field(c,"添加一条待办","添加",async s=>{
    const heading=path===daily()?"今日":path===weekly()?"本周要完成":null;
    if(!heading) return append(path,"# AI 学习路线","- [ ] "+s);
    let f=app.vault.getFileByPath(path);
    if(!f) {
      try { f=await app.vault.create(path,"# "+day()+"\n"); }
      catch(e){ f=app.vault.getFileByPath(path); if(!f) throw e; }
    }
    await app.vault.process(f,old=>{
      const lines=old.split("\n"), start=lines.findIndex(line=>line.trim()==="## "+heading);
      if(start<0) return old.trimEnd()+"\n\n## "+heading+"\n\n- [ ] "+s+"\n";
      const next=lines.findIndex((line,i)=>i>start && /^#{1,2} /.test(line));
      lines.splice(next<0?lines.length:next,0,"- [ ] "+s,"");
      return lines.join("\n");
    });
  });
}
function notes(c,md,empty) {
  const lines=md.split("\n").filter(s=>s.startsWith("- ")&&!/^\s*- \[[ xX]\]/.test(s));
  if(!lines.length) quiet(c,empty);
  lines.slice(-15).reverse().forEach(s=>c.createEl("p",{text:s.slice(2)}));
}
function fileList(c,folder,limit=10) {
  const list=app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(folder+"/")).sort((a,b)=>b.stat.mtime-a.stat.mtime);
  if(!list.length) quiet(c,"暂无笔记");
  list.slice(0,limit).forEach(f=>{
    const li=c.createDiv({cls:"wy-row"});
    link(li,f.path,f.basename);
  });
  return list.length;
}
function model(prompt) {
  return window.require(app.vault.adapter.getBasePath() + "/工作看板/运行文件/组件/轻量模型.cjs")(prompt);
}
const mentors = window.require(app.vault.adapter.getBasePath() + "/工作看板/运行文件/组件/导师配置.cjs");
function advisor() {
  const c=card("选择人物视角","wy-wide");
  quiet(c,"基于人物公开方法的模拟视角");
  const select=c.createEl("select",{attr:{"aria-label":"人物视角"}});
  Object.keys(mentors).forEach(name=>select.createEl("option",{text:name,value:name}));
  const question=c.createEl("textarea",{attr:{placeholder:"想讨论什么？","aria-label":"讨论问题",rows:"3"}});
  const out=c.createEl("pre",{cls:"wy-result","attr":{"aria-live":"polite"}});
  button(c,"提问",async()=>{
    const q=question.value.trim();
    if(!q)return;
    const name=select.value;
    out.setText("正在获取 "+name+" 视角…");
    try {
      const mentor = mentors[name];
      out.setText(await model(`只回答，不写文件。按${name}的公开方法提供模拟意见，不冒充本人。方法：${mentor.method}。参考本地技能 ${mentor.source}。给出判断、理由、可验证下一步与适用边界，引用须可核对。问题：${q}`));
    } catch(e) {out.setText(""); throw e;}
  });
}
let revision=0;
async function render() {
  const renderId=++revision;
  const rootScroll=grid.scrollTop;
  const p=input.page;
  const [d,w,ideas,life,feed,progress,learning]=await Promise.all(
    [daily(),weekly(),"知识库/灵感/灵感.md",data+"生活记录.md",data+"今日AI圈.json",data+"项目进度.md",data+"AI学习路线.md"].map(read));
  if(renderId!==revision || !root.isConnected && dv.container.isConnected) return;
  const drafts=[...grid.querySelectorAll("form input")].map(e=>e.value);
  grid.empty();
  let news={items:[],methods:[]};
  if(feed) {try {news=JSON.parse(feed);} catch {status.setText("资讯文件格式有误");}}
  if(p==="工作看板") {
    for(const [name,metric,hint,tone] of [
      ["今日与本周", String(rows(d).filter(x=>!x.done).length),"今天待办 · 本周任务 · 日志","wy-wide"],
      ["项目与学习",String(rows(learning).filter(x=>x.done).length),"Codex 进度 · AI 学习","wy-dark"],
      ["知识与灵感",String(app.vault.getMarkdownFiles().filter(f=>f.path.startsWith("信息采集/待整理/")).length),"网页剪藏 · 知识关联 · 灵感","wy-mint"],
      ["今日AI圈",String(news.items?.length||0),news.updated||"等待资讯","wy-wide"],
      ["生活","生活记录","健身与睡眠","wy-mint"],
      ["观点讨论室","选择视角","技能与经典",""]]) {
      const c=card(name,tone);
      c.createDiv({cls:"wy-num",text:metric});
      quiet(c,hint);
      link(c,"工作看板/"+name,"打开");
    }
  } else if (p==="今日与本周") {
    tasks(card("今天","wy-wide"),daily(),d);
    tasks(card("本周任务","wy-mint"),weekly(),w);
    const c=card("每日与每周日志","wy-wide");
    fileList(c,"工作看板/每日与每周");
  } else if(p==="项目与学习") {
    const c=card("Codex 项目进度","wy-wide");
    notes(c,progress,"等待当天项目汇总");
    if(progress) link(c,data+"项目进度.md","查看当日会话清单");
    button(c,"同步本机 Codex",async()=>{
      const {execFile}=require("child_process"), path=require("path");
      const script=path.join(app.vault.adapter.getBasePath(),"工作看板/运行文件/组件/汇总Codex.py");
      await new Promise((resolve,reject)=>execFile((window.require("node:process").env.BOARD_PYTHON || "python3"),[script],{timeout:30000},(e)=>e?reject(e):resolve()));
      await render();
      status.setText("已同步本机 Codex");
    });
    const l=card("AI 学习路线","wy-mint");
    tasks(l,data+"AI学习路线.md",learning);
    link(l,data+"AI学习路线.md","编辑学习路线");
  } else if(p==="知识与灵感") {
    fileList(card("待整理"),"信息采集/待整理");
    fileList(card("已整理原件"),"信息采集/已整理");
    const k=card("资料摘要","wy-mint");
    fileList(k,"知识库/资料摘要");
    link(k,"知识库/目录","查看知识库/资料摘要目录");
    const c=card("灵感","wy-wide");
    notes(c,ideas,"暂无灵感");
    field(c,"随手记一条灵感","保存",s=>append("知识库/灵感/灵感.md","# 灵感","- "+day()+" · "+s));
    link(c,"工作看板/工作看板.md","在工作看板查看七维评估");
  } else if(p==="生活") {
    const c=card("睡眠与健身","wy-wide");
    notes(c,life,"暂无生活记录");
    field(c,"例如：昨晚睡了 7 小时，今天练了背","记录",s=>append(data+"生活记录.md","# 生活记录","- "+day()+" · "+s));
    link(c,data+"生活记录.md","编辑生活记录");
    const chat=card("对话记录");
    field(chat,"用一句话说今天的健身或睡眠","用轻量模型整理",async(s)=>{
      const result=await model("将下列生活记录整理成一行中文。保持用户表达的日期、数值和动作，不推测缺失信息，不给建议，不使用任何工具。记录："+s);
      if(!result)throw Error("未获得记录内容");
      await append(data+"生活记录.md","# 生活记录","- "+day()+" · "+result.replace(/[\r\n]+/g," "));
    });
  } else if(p==="观点讨论室") advisor();
  else if(p==="今日AI圈"){
    const c=card("今日 AI 圈","wy-wide");
    quiet(c,[news.source,news.updated].filter(Boolean).join(" · ")||"等待 X 资讯");
    external(c,"https://x.com/home","打开 X 关注流");
    const m=card("AI 搞钱与变现","wy-mint");
    for(const [target,list,empty] of [[c,news.items,"暂无资讯"],[m,news.methods,"暂无可核验的方法"]]){
      if(!list?.length)quiet(target,empty);
      for(const i of (list||[]).slice(0,15)){
        const row=target.createDiv({cls:"wy-row"});
        external(row,i.url,i.title);
        quiet(row,[i.summary,i.tag,i.reason].filter(Boolean).join(" · "));
      }
    }
  }
  grid.querySelectorAll("form input").forEach((e,i)=>{if(drafts[i]) e.value=drafts[i];});
  grid.scrollTop=rootScroll;
}
void render().catch(e=>status.setText("看板加载失败："+e.message));
if(input.page!=="观点讨论室" && dv.component?.registerEvent){
  const sync=f=>{
    if(!f.path.startsWith("工作看板/运行文件/数据/") && !f.path.startsWith("工作看板/每日与每周/") &&
       !f.path.startsWith("信息采集/") && !f.path.startsWith("知识库/")) return;
    if(grid.contains(document.activeElement) && document.activeElement.matches("input:not([type=checkbox]),textarea")) return;
    void render().catch(e=>status.setText("同步失败："+e.message));
  };
  for(const event of ["create","modify","delete","rename"]) dv.component.registerEvent(app.vault.on(event,sync));
}
