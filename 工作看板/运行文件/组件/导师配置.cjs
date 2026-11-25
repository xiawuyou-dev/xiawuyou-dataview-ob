const { homedir } = require("node:os");
const { join } = require("node:path");

const skills = join(homedir(), ".codex", "skills");
const perspective = name => join(skills, "nuwa-skill", "examples", name + "-perspective", "SKILL.md");

module.exports = {
  "姜胡说": {
    id: "owl", tint: "#ffb875", lens: "每日取舍",
    rubric: [["真实价值",35],["验证与反馈",30],["资源投入",20],["可持续性",15]],
    evidence: ["outputs","testing","constraints","focus"],
    source: join(skills, "jianghushuo-advisor", "SKILL.md"),
    method: "从预期结果倒推今天最小的行动，写清什么反馈会让你换方向。涉及变现时先确认谁愿意用什么交换什么结果。"
  },
  "保罗·格雷厄姆": {
    id: "paul-graham", tint: "#ffc18a", lens: "用户验证",
    rubric: [["真实需求",30],["用户接触",30],["试用信号",25],["试验范围",15]],
    evidence: ["testing","testing","outputs","focus"],
    source: perspective("paul-graham"),
    method: "先找近期做过这个任务的人，问上次怎么解决。优先判断谁愿意带真实素材试用，记录替代方案和拒绝原因。"
  },
  "卡帕西": {
    id: "karpathy", tint: "#95b2ff", lens: "AI 实作",
    rubric: [["可复现性",30],["验收质量",30],["模型使用边界",25],["实现成本",15]],
    evidence: ["outputs","testing","constraints","constraints"],
    source: perspective("andrej-karpathy"),
    method: "固定输入、输出和可观察的验收标准，让别人独立跑一遍。定位失败步骤并判断哪里确实需要模型。"
  },
  "乔布斯": {
    id: "jobs", tint: "#b0c4cf", lens: "产品体验",
    rubric: [["核心任务",35],["首次体验",30],["取舍清晰度",20],["验证证据",15]],
    evidence: ["focus","testing","focus","outputs"],
    source: perspective("steve-jobs"),
    method: "从用户第一次打开产品的核心动作倒推，删掉分散注意力的步骤，用一次完整操作或演示检查卡点。"
  },
  "MrBeast": {
    id: "mrbeast", tint: "#e1a5fa", lens: "内容表达",
    rubric: [["受众与选题",30],["开场承诺",25],["画面证据",25],["反馈验证",20]],
    evidence: ["focus","focus","outputs","testing"],
    source: perspective("mrbeast"),
    method: "把真实试用结果变成观众能一眼理解的画面，核对封面与开场承诺是否兑现，再用实际反馈判断节奏。"
  },
  "芒格": {
    id: "munger", tint: "#f3d8a2", lens: "风险与止损",
    rubric: [["失败路径",30],["投入上限",30],["机会成本",25],["退出条件",15]],
    evidence: ["testing","constraints","focus","constraints"],
    source: perspective("munger"),
    method: "先反推这件事会怎样失败，检查激励、机会成本和不可逆投入，给一个可观察的继续或退出条件。"
  },
  "纳瓦尔": {
    id: "naval", tint: "#a6db9a", lens: "长期积累",
    rubric: [["独特能力",30],["成果复用",30],["传播杠杆",20],["可持续投入",20]],
    evidence: ["outputs","outputs","testing","constraints"],
    source: perspective("naval"),
    method: "找用户能长期积累的独特能力，判断这次交付能否沉淀为可复用的代码、内容或产品，并检查持续投入的成本。"
  }
};
