const { execFile } = require("node:child_process");
const { tmpdir } = require("node:os");

const cli = process.env.BOARD_CODEX || "codex";
const args = [
  "-a", "never", "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral",
  "--skip-git-repo-check", "--sandbox", "read-only", "-m", "gpt-5.6-luna",
  "-c", 'model_reasoning_effort="low"', "-c", "mcp_servers={}", "-"
];

module.exports = function ask(prompt, { translationOnly = false, fastAdvice = false, fastGrade = false, fastText = false, accept } = {}) {
  return new Promise((resolve, reject) => {
    const quick = fastAdvice || fastGrade || fastText;
    const invocation = translationOnly || quick ? [
      ...args.slice(0,-1),
      ...["shell_tool","unified_exec","apps","plugins","browser_use","browser_use_external","code_mode_host","multi_agent","view_image","skill_search"].flatMap(name=>["--disable",name]),
      "--enable","skip_host_skill_discovery","-c",'web_search="disabled"',"-"
    ] : args;
    if (quick) {
      invocation[invocation.indexOf("-m")+1] = "gpt-6-luna";
      invocation.splice(invocation.indexOf("exec")+1,0,"--json");
    }
    let answerEvent = "", pending = "";
    const child = execFile(cli, invocation, { cwd: tmpdir(), timeout: fastGrade ? 26000 : fastText ? 18000 : quick ? 32000 : 90000, maxBuffer: 512000 }, (error, output, diagnostics) => {
      const answer = quick ? "" : output.trim();
      if (!error && answer) return resolve(answer);

      let reason = "模型服务未返回结果";
      if (error?.code === "ENOENT") reason = "找不到本机 Codex CLI";
      else if (error?.killed) reason = "模型响应超时";
      else if (/usage limit|rate limit|insufficient_quota|\b429\b/i.test(diagnostics)) reason = "模型额度暂时用完";
      else if (/\b401\b|unauthorized|not logged in|authentication required/i.test(diagnostics)) reason = "Codex CLI 需要重新登录";
      else if (/stream disconnected|request timed out|failed to connect|error sending request/i.test(diagnostics)) reason = "模型服务连接失败";
      reject(new Error(reason + "。输入已保留，可以重试。"));
    });
    // The final turn event may arrive seconds before the subprocess exits.
    if (quick) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data",chunk=>{
        pending += chunk;
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const line of lines) {
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type==="item.completed" && event.item?.type==="agent_message") {
            answerEvent = typeof event.item.text==="string" ? event.item.text.trim() : "";
            if (accept && answerEvent) {
              try {
                const parsed=JSON.parse(answerEvent.replace(/^\s*```(?:json)?\s*|\s*```\s*$/gi,""));
                if (accept(parsed)) { resolve(answerEvent); child.kill(); }
              } catch {}
            }
          } else if (event.type==="turn.completed" && answerEvent) {
            resolve(answerEvent);
          }
        }
      });
    }
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
};
