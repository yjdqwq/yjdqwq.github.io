# OI 题目评分方案调研

核验日期：2026-10-25。下列“本站采用”均是产品设计决定，不是原平台已经采用的规则。

| 来源 | 实际方案及边界 | 本站采用 |
|---|---|---|
| [QOJ 题库](https://qoj.ac/problems?order=desc&sort=zan)、[公开前端](https://qoj.ac/js/uoj.js)、[难度说明](https://qoj.ac/blog/qingyu/blog/1280) | 用户 Rating 赞踩反馈与 Difficulty 分开。难度为 0～10；赞踩是反馈计数，不能当成同一量表的质量分。没有据此核实后端的所有准入与反刷规则。 | 质量与难度分开，展示样本规模，不从净票数推导本站分数。 |
| [USACO Rating FAQ](https://codetiger.me/project/usaco/frontend/faq.html)、[项目首页](https://codetiger.me/project/usaco/) | CodeTiger 创建的社区项目，非 USACO 官方评分。质量 1～5，难度 800～3500；使用经审核用户投票，提供均值／中位数视角。其资格门槛与 CF 难度标尺有关。 | 单独收集质量分，展示人数、均值、中位数和经历；不机械照搬 CF 门槛。 |
| [Qingyu：ucup 审题 rubric](https://qoj.ac/blog/qingyu/blog/1777) | 作者明确称为随笔，讨论 UCup Finals 选题流程。Rating、Difficulty、Expertise 分开填写；可有价值却仍然不推荐录用，也存在普通的边界题。不是 QOJ 公共投票量表或所有比赛的统一标准。 | 分开记录质量、经历和用途；普通题不自动得正分；评语补充分数依据。 |
| [IOI 2027 征题](https://ioi2027.de/contest/call-for-tasks/) | 官方欢迎简单与困难、富有创意且容易理解的题目，也鼓励有洞察、允许多种解法的简单题。 | 不把难度、算法名称或代码长度当成质量。 |
| [洛谷题目难度体系](https://help.luogu.com.cn/manual/luogu/problem/difficulty)、[审核要求存档](https://help.luogu.com.cn/rules/academic/lgr/review) | 现为八档难度，并承认主观差异；审核资料强调题意清楚、歧义说明、部分分和评测规范。存档要求不能冒称当前通行规定。 | 缺失的难度保持未知；题目故障另行反馈，不把“已收录”当成好题认证。 |
| [CF Problem Difficulties](https://codeforces.com/blog/entry/62865)、[Problem Likeability Feature](https://codeforces.com/blog/entry/81293) | problem rating 表示题目难度；后一篇是社区提案，不能据此证明官方质量投票功能已上线。 | 不使用 CF 难度代替质量，不把未实现的提议当成已存在功能。 |

## 本站的选择

直接使用用户约定的 −10～10 质量分，0 为一般题。评价者整体判断，具体理由作为证据，不将多个维度机械加权。竞赛与学习用途分开，经历自报并可筛选，不宣称已验证解题资格。

首版使用 GitHub 身份与 Issues 公开记录、GitHub Actions 汇总、GitHub Pages 静态展示。官网说明 [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) 只托管静态内容，因此浏览器草稿不会假装成已提交的多人评分。身份取自 GitHub Issue 元数据，不能由评分 JSON 自填；一账号一题目版本一用途取最后更新记录。

均分、中位数和分布都是观察到的样本摘要，不是人类总体质量真值。初始题库只提供公开题目的入口，没有伪造评分、投票人数或示例共识。
