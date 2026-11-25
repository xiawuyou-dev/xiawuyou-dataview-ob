const { request } = require("node:http");

const endpoint = "http://127.0.0.1:3425/v1/responses";
const model = "workbuddy/deepseek-v4.1-flash";
const timeoutMs = 9000;

module.exports = async function mentorChat(prompt, accept) {
  const signal = AbortSignal.timeout(timeoutMs);
  const payload = JSON.stringify({
    model, input: prompt, reasoning: { effort: "none" },
    tools: [], store: false, max_output_tokens: 850
  });
  let response;
  try {
    response = await new Promise((resolve, reject) => {
      const req = request(endpoint, {
        method: "POST", signal, headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(process.env.BOARD_MENTOR_TOKEN ? { Authorization: "Bearer " + process.env.BOARD_MENTOR_TOKEN } : {})
        }
      }, res => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", chunk => { body += chunk; });
        res.on("error", reject);
        res.on("end", () => resolve({ status: res.statusCode, body }));
      });
      req.on("error", reject);
      req.end(payload);
    });
  } catch {
    throw Error(signal.aborted ? "快评未在 9 秒内返回，已保留原结果。" : "无法连接本机模型服务（Magpie），已保留原结果。");
  }
  if (response.status === 429) throw Error("模型暂时限流，已保留原结果。");
  if (response.status >= 400) throw Error(`快评服务暂不可用（HTTP ${response.status}），已保留原结果。`);
  try {
    const result = JSON.parse(response.body);
    if (result.status !== "completed" || result.error) throw Error();
    const raw = (result.output || []).filter(item => item.type === "message" && item.role === "assistant")
      .flatMap(item => item.content || []).filter(item => item.type === "output_text").map(item => item.text).join("");
    const value = JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi, "")
      .replace(/"(?:[^"\\]|\\.)*"|<br\s*\/?\s*>/gi, token => token[0] === '"' ? token : " "));
    if (!accept(value)) throw Error();
    return value;
  } catch {
    throw Error("快评返回的建议不完整，已保留原结果。");
  }
};
