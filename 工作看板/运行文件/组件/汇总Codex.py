"""Read today's local session events and update only the generated sections."""
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import json, os, re, sys

cn = timezone(timedelta(hours=8))
today = datetime.now(cn).date()
start = datetime(today.year, today.month, today.day, tzinfo=cn).timestamp()
vault = Path(__file__).resolve().parents[3]
codex = Path(os.environ.get("CODEX_HOME", Path.home()/".codex"))
try:
    index = {r["id"]:r["thread_name"] for r in
             map(json.loads,(codex/"session_index.jsonl").read_text().splitlines())}
except (OSError, KeyError, ValueError):
    index = {}

def plain(value, length=220):
    return re.sub(r"[\r\n\t]+"," ",str(value)).strip()[:length]

def chat_ideas(records, since):
    """Capture explicit product intentions from the selected chat's user messages."""
    found = {}
    for raw in records:
        try:
            row = json.loads(raw)
            timestamp = datetime.fromisoformat(row.get("timestamp","").replace("Z","+00:00"))
        except (ValueError,TypeError):
            continue
        if timestamp < since or row.get("type") != "response_item":
            continue
        message = row.get("payload",{})
        if message.get("role") != "user":
            continue
        for item in message.get("content",[]):
            if item.get("type") != "input_text":
                continue
            for line in item.get("text","").splitlines():
                line = line.strip()
                explicit = re.match(r"^(?:[-*] +)?(?:新灵感|产品灵感|灵感|App想法|新App)[：:]\s*(.+)$",line,re.I)
                intent = re.match(r"^我(?:还|最近|接下来)?想(?:做|开发|试做)(?:一个|一款)?(.+)$",line)
                if explicit:
                    idea = explicit[1]
                elif intent and re.search(r"\bApp\b|应用|小程序|插件|软件",intent[1],re.I):
                    idea = intent[1]
                else:
                    continue
                idea = plain(idea,350)
                if not idea or idea.startswith(("http://","https://","[","<")):
                    continue
                title = re.split(r"[：:。！？；]",idea,maxsplit=1)[0].strip()
                if not title:
                    continue
                if "：" not in idea and ":" not in idea and len(title) > 26:
                    idea = title[:24] + "：" + idea
                    title = title[:24]
                found[title] = (timestamp,idea)
    return sorted(found.values(),key=lambda pair:pair[0])


def sync_chat_ideas():
    config = json.loads((vault/"工作看板/运行文件/界面/config.json").read_text())
    chat_id = config.get("ideasChatId","")
    if not re.fullmatch(r"[a-f0-9-]{36}",chat_id) or not config.get("ideasSyncFrom"):
        return
    since = datetime.fromisoformat(config["ideasSyncFrom"].replace("Z","+00:00"))
    candidates = [path for folder in ("sessions","archived_sessions")
                  for path in (codex/folder).rglob(f"*{chat_id}.jsonl")]
    if not candidates:
        return
    path = max(candidates,key=lambda item:item.stat().st_mtime)
    with path.open() as rows:
        ideas = chat_ideas(rows,since)
    destination = vault/"工作看板/运行文件/数据/聊天灵感.md"
    text = "# 聊天灵感\n\n" + "\n".join(
        f"- {timestamp.astimezone(cn).date()} · {idea}" for timestamp,idea in ideas) + "\n"
    if destination.exists() and destination.read_text() == text:
        return
    from tempfile import NamedTemporaryFile
    with NamedTemporaryFile(mode="w",encoding="utf-8",dir=destination.parent,delete=False) as staged:
        staged.write(text)
    Path(staged.name).replace(destination)


if "--ideas-only" in sys.argv:
    sync_chat_ideas()
    sys.exit(0)

sessions = {}
for folder in ("sessions","archived_sessions"):
    for path in (codex/folder).rglob("*.jsonl"):
        try:
            if path.stat().st_mtime < start:
                continue
            events = []
            meta = {}
            for line in path.open():
                try: r = json.loads(line)
                except ValueError: continue
                if r.get("type")=="session_meta":
                    meta = r.get("payload",{})
                if r.get("type")!="event_msg":
                    continue
                stamp = r.get("timestamp","")
                try: date_cn = datetime.fromisoformat(stamp.replace("Z","+00:00")).astimezone(cn).date()
                except ValueError: continue
                if date_cn==today:
                    events.append(r.get("payload",{}))
            if not events: continue
            key = meta.get("id",path.stem)
            events = [e for e in events if e.get("type") in ("task_started","task_complete","turn_aborted","user_message")]
            if not events: continue
            sessions[key] = (meta,events)
        except OSError:
            continue

lines = []
for key,(meta,events) in sorted(sessions.items(),key=lambda x:str(x[1][0].get("cwd",""))):
    cwd = meta.get("cwd","")
    name = plain(index.get(key,Path(cwd).name or "未命名会话"))
    project = plain(Path(cwd).name) if cwd else "无项目目录"
    completed = sum(e.get("type")=="task_complete" for e in events)
    submitted = sum(e.get("type")=="user_message" for e in events)
    lines.append(f"- {project} · {name}｜{submitted} 条请求 / {completed} 轮完成｜项目进度待核验｜会话 {key}")
# Use completed turn summaries for learning clues, with bounded labels instead
# of copying arbitrary chat text into the vault.
learning_topics = [
    ("Obsidian 知识工作台", r"Obsidian|Dataview", r"剪藏|看板|知识库整理"),
    ("AI 辅助剪辑", r"剪辑|字幕|Remotion", r"样片|录屏|模板|Skill"),
    ("AI 原型与应用验证", r"原型|App|iOS", r"构建|验收|试用|真机"),
    ("Skill 设计与复用", r"Skill|SKILL.md", r"安装|复跑|验证|验收"),
]
learning = {label: set() for label, _, _ in learning_topics}
for key, (_, events) in sessions.items():
    for event in events:
        if event.get("type") != "task_complete":
            continue
        final = event.get("last_agent_message")
        if not isinstance(final, str):
            continue
        excerpt = final[:12000]
        for label, subject, work in learning_topics:
            if re.search(subject, excerpt, re.I) and re.search(work, excerpt, re.I):
                learning[label].add(key)
learning_lines = [f"- {label} · {len(keys)} 个会话的最近总结提及"
                  for label, keys in learning.items() if keys]
banner = f"本机可读范围 · {today} · {len(lines)} 条有活动的会话。轮次表示会话活动。"
body = "\n".join(lines) if lines else "当天暂无可读取的会话事件。"

def section(path, tag, heading, block):
    old = path.read_text() if path.exists() else heading+"\n"
    opening, closing = f"<!-- {tag} -->",f"<!-- /{tag} -->"
    replacement = f"{opening}\n{block}\n{closing}"
    pattern = re.escape(opening)+r".*?"+re.escape(closing)
    if re.search(pattern,old,re.S):
        new=re.sub(pattern,lambda _:replacement,old,count=1,flags=re.S)
    else:
        new=old.rstrip()+"\n\n"+replacement+"\n"
    if new != old:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(new)
        tmp.replace(path)
    elif not path.exists():
        path.write_text(new)

data = vault/"工作看板/运行文件/数据"
dated = vault/"工作看板/每日与每周"
monday = today-timedelta(days=today.weekday())
section(data/"项目进度.md","codex-activity","# Codex 项目记录",banner+"\n\n"+body)
section(data/"项目进度.md","codex-learning","# Codex 项目记录",
        "## Codex 学习线索\n\n"+"\n".join(learning_lines or ["当天暂无可提取的学习线索。"]))
if "--board-only" not in sys.argv:
    section(dated/f"{today}.md","codex-activity",f"# {today}","## Codex 当日记录\n\n"+banner+"\n\n"+body)
    section(dated/f"周-{monday}.md","codex-"+str(today),f"# {monday} 当周","## "+str(today)+"\n\n"+banner+"\n\n"+body)
print(banner)
